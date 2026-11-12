"""Dictionary-shaped storage with optional MongoDB persistence.

Set ``PERSISTENCE=mongo`` to use MongoDB. The default remains in-memory so the
application is easy to run locally without a database.
"""

from collections.abc import Iterator, MutableMapping
from copy import deepcopy

from app.core.config import settings


class Store(MutableMapping):
    def __init__(self, collection_name: str):
        self._memory = {}
        self._collection = None

        if settings.PERSISTENCE == "mongo":
            from pymongo import MongoClient

            client = MongoClient(settings.MONGO_URI, serverSelectionTimeoutMS=2000)
            database = client[settings.MONGO_DB_NAME]
            self._collection = database[collection_name]

    @property
    def mode(self) -> str:
        return "mongo" if self._collection is not None else "memory"

    @staticmethod
    def _clean(document):
        if document is None:
            return None
        document = dict(document)
        document.pop("_id", None)
        return document

    def __getitem__(self, key):
        value = self.get(key)
        if value is None:
            raise KeyError(key)
        return value

    def __setitem__(self, key, value):
        value = deepcopy(value)
        if self._collection is None:
            self._memory[key] = value
            return

        self._collection.replace_one(
            {"_id": key},
            {"_id": key, "value": value},
            upsert=True,
        )

    def __delitem__(self, key):
        if self._collection is None:
            del self._memory[key]
            return

        result = self._collection.delete_one({"_id": key})
        if result.deleted_count == 0:
            raise KeyError(key)

    def __iter__(self) -> Iterator:
        if self._collection is None:
            return iter(self._memory)
        return (document["_id"] for document in self._collection.find({}, {"_id": 1}))

    def __len__(self) -> int:
        if self._collection is None:
            return len(self._memory)
        return self._collection.count_documents({})

    def get(self, key, default=None):
        if self._collection is None:
            return self._memory.get(key, default)

        document = self._collection.find_one({"_id": key})
        if document is None:
            return default
        return deepcopy(document.get("value", default))

    def values(self):
        if self._collection is None:
            return list(self._memory.values())
        return [deepcopy(document.get("value")) for document in self._collection.find()]

    def setdefault(self, key, default=None):
        value = self.get(key)
        if value is None:
            self[key] = default
            return deepcopy(default)
        return value


households = Store("households")
alerts = Store("alerts")
users = Store("users")
monitoring_runs = Store("monitoring_runs")
telegram_link_tokens = Store("telegram_link_tokens")
simulation_jobs = Store("simulation_jobs")
