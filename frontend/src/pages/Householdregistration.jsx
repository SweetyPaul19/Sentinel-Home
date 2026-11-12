import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import {
  getTelegramLinkStatus,
  loginAccount,
  registerAccount,
  registerHousehold,
  startTelegramLink,
} from '../api/client'
import {
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  Radar,
  Activity,
  Compass,
  BellRing,
  Search,
  LocateFixed,
  X,
  Loader2,
  Baby,
  PersonStanding,
  Accessibility,
  HeartPulse,
  Stethoscope,
  ShieldOff,
  Check,
  ShieldAlert,
  Pencil,
} from 'lucide-react'

import '../styles/sentinel-ui.css'

/* ============================================================================
   CONFIG — options, initial state, validation
   ============================================================================ */

const STEP_LABELS = [
  'Location',
  'Building',
  'Household',
  'Vulnerability',
  'Contacts',
  'Review',
]

const BUILDING_TYPE_OPTIONS = [
  { value: 'Reinforced Concrete', label: 'Reinforced Concrete' },
  { value: 'Masonry', label: 'Masonry' },
  { value: 'Steel', label: 'Steel' },
  { value: 'Timber', label: 'Timber' },
  { value: 'Other', label: 'Other' },
]

const FOUNDATION_TYPE_OPTIONS = [
  { value: 'Bamboo/Timber', label: 'Bamboo / Timber' },
  { value: 'Cement-Stone/Brick', label: 'Cement-Stone / Brick' },
  { value: 'Mud mortar-Stone/Brick', label: 'Mud mortar-Stone / Brick' },
  { value: 'RC', label: 'Reinforced Concrete (RC)' },
  { value: 'Other', label: 'Other' },
]

const GROUND_FLOOR_TYPE_OPTIONS = [
  { value: 'Brick/Stone', label: 'Brick / Stone' },
  { value: 'Mud', label: 'Mud' },
  { value: 'RC', label: 'Reinforced Concrete' },
  { value: 'Timber', label: 'Timber' },
  { value: 'Other', label: 'Other' },
]

const ROOF_TYPE_OPTIONS = [
  { value: 'Bamboo/Timber-Light roof', label: 'Bamboo/Timber — Light' },
  { value: 'Bamboo/Timber-Heavy roof', label: 'Bamboo/Timber — Heavy' },
  { value: 'RCC/RB/RBC', label: 'RCC' },
]

// NOTE: "Not applicable" must remain selectable — many buildings have no
// separate other-floor construction. Values follow the project's earthquake
// risk model categories; adjust if your trained model uses different labels.
const OTHER_FLOOR_TYPE_OPTIONS = [
  { value: 'Not applicable', label: 'Not applicable' },
  { value: 'TImber/Bamboo-Mud', label: 'Timber/Bamboo — Mud' },
  { value: 'Timber-Planck', label: 'Timber — Plank' },
  { value: 'RCC/RB/RBC', label: 'RCC' },
  { value: 'Other', label: 'Other' },
]

const POSITION_OPTIONS = [
  { value: 'Attached-1 side', label: 'Attached — 1 side' },
  { value: 'Attached-2 side', label: 'Attached — 2 sides' },
  { value: 'Attached-3 side', label: 'Attached — 3 sides' },
  { value: 'Not attached', label: 'Not attached' },
]

const LAND_SURFACE_OPTIONS = [
  { value: 'Flat', label: 'Flat' },
  { value: 'Moderate slope', label: 'Moderate slope' },
  { value: 'Steep slope', label: 'Steep slope' },
]

// NOTE: plan configuration categories follow the common set used by the
// project's earthquake risk model. Adjust the `value`s if your model's
// training data uses different labels.
const PLAN_CONFIGURATION_OPTIONS = [
  { value: 'Rectangular', label: 'Rectangular' },
  { value: 'Square', label: 'Square' },
  { value: 'L-shape', label: 'L-Shape' },
  { value: 'T-shape', label: 'T-Shape' },
  { value: 'U-shape', label: 'U-Shape' },
  { value: 'Multi-projected', label: 'Multi-projected' },
  { value: 'Others', label: 'Other' },
  { value: 'Building with Central Courtyard', label: 'Central courtyard' },
  { value: 'E-shape', label: 'E-Shape' },
  { value: 'H-shape', label: 'H-Shape' },
]

// NOTE: superstructure material is multi-select — a building can be built
// from more than one material. Each id maps to a `has_superstructure_<id>`
// boolean flag expected by the earthquake risk model; keep these ids in sync
// with the trained model's feature columns.
const SUPERSTRUCTURE_MATERIAL_OPTIONS = [
  { value: 'adobe_mud', label: 'Adobe / Mud' },
  { value: 'mud_mortar_stone', label: 'Mud mortar — Stone' },
  { value: 'stone_flag', label: 'Stone flag' },
  { value: 'cement_mortar_stone', label: 'Cement mortar — Stone' },
  { value: 'mud_mortar_brick', label: 'Mud mortar — Brick' },
  { value: 'cement_mortar_brick', label: 'Cement mortar — Brick' },
  { value: 'timber', label: 'Timber' },
  { value: 'bamboo', label: 'Bamboo' },
  { value: 'rc_non_engineered', label: 'RC — Non-engineered' },
  { value: 'rc_engineered', label: 'RC — Engineered' },
  { value: 'other', label: 'Other' },
]

const VULNERABLE_MEMBER_OPTIONS = [
  { id: 'children', label: 'Children', description: 'Extra assistance may be required', icon: Baby },
  { id: 'elderly', label: 'Elderly', description: 'May require mobility assistance', icon: PersonStanding },
  { id: 'disabled', label: 'Disabled', description: 'May require accessibility support', icon: Accessibility },
  { id: 'pregnant', label: 'Pregnant', description: 'May require priority evacuation', icon: HeartPulse },
  { id: 'medical', label: 'Medical needs', description: 'Ongoing care or medication needs', icon: Stethoscope },
  { id: 'none', label: 'None', description: 'No additional assistance needed', icon: ShieldOff },
]

const FLOW_STAGES = [
  { icon: Radar, label: 'Detect' },
  { icon: Activity, label: 'Assess' },
  { icon: Compass, label: 'Advise' },
  { icon: BellRing, label: 'Alert' },
]

const initialFormData = {
  location: '',
  latitude: '',
  longitude: '',
  building_type: '',
  count_floors_pre_eq: '',
  age_building: '',
  plinth_area_sq_ft: '',
  height_ft_pre_eq: '',
  foundation_type: '',
  ground_floor_type: '',
  roof_type: '',
  other_floor_type: '',
  position: '',
  land_surface_condition: '',
  plan_configuration: '',
  superstructure_materials: [],
  household_size: '',
  household_name: '',
  vulnerable_members: [],
  emergency_contact_name: '',
  emergency_contact_phone: '',
  relatives: [],
}

const isPositiveInteger = (value) => /^\d+$/.test(String(value)) && Number(value) > 0
const isNonNegativeNumber = (value) => /^\d+(\.\d+)?$/.test(String(value)) && Number(value) >= 0
const isPositiveNumber = (value) => /^\d+(\.\d+)?$/.test(String(value)) && Number(value) > 0
const isValidLatLng = (value, min, max) => {
  if (value === '' || value === null || value === undefined) return false
  const n = Number(value)
  return !Number.isNaN(n) && n >= min && n <= max
}
const isValidPhone = (value) => /^[+]?[\d\s()-]{7,15}$/.test(String(value).trim())

function validateStep(stepIndex, formData) {
  const errors = {}

  if (stepIndex === 0) {
    if (!formData.location.trim()) errors.location = 'Enter or select a location.'
    if (!isValidLatLng(formData.latitude, -90, 90)) errors.latitude = 'A valid latitude is required.'
    if (!isValidLatLng(formData.longitude, -180, 180)) errors.longitude = 'A valid longitude is required.'
  }

  if (stepIndex === 1) {
    if (!formData.building_type) errors.building_type = 'Select a building type.'
    if (!isPositiveInteger(formData.count_floors_pre_eq)) {
      errors.count_floors_pre_eq = 'Enter a positive whole number.'
    }
    if (!isNonNegativeNumber(formData.age_building)) {
      errors.age_building = 'Enter a valid building age.'
    }
    if (!isPositiveNumber(formData.plinth_area_sq_ft)) {
      errors.plinth_area_sq_ft = 'Enter a valid plinth area (sq ft).'
    }
    if (!isPositiveNumber(formData.height_ft_pre_eq)) {
      errors.height_ft_pre_eq = 'Enter a valid building height (ft).'
    }
    if (!formData.foundation_type) errors.foundation_type = 'Select a foundation type.'
    if (!formData.ground_floor_type) errors.ground_floor_type = 'Select a ground floor type.'
    if (!formData.roof_type) errors.roof_type = 'Select a roof type.'
    if (!formData.other_floor_type) errors.other_floor_type = 'Select an other-floor type (or Not applicable).'
    if (!formData.position) errors.position = 'Select a position.'
    if (!formData.land_surface_condition) errors.land_surface_condition = 'Select land surface condition.'
    if (!formData.plan_configuration) errors.plan_configuration = 'Select a plan configuration.'
    if (!formData.superstructure_materials.length) {
      errors.superstructure_materials = 'Select at least one superstructure material.'
    }
  }

  if (stepIndex === 2) {
    if (!isPositiveInteger(formData.household_size)) {
      errors.household_size = 'Enter the number of people (whole number).'
    }
  }

  // Step 3 (vulnerability) has no required fields.

  if (stepIndex === 4) {
    if (!formData.emergency_contact_name.trim()) {
      errors.emergency_contact_name = 'Emergency contact name is required.'
    }
    if (!formData.emergency_contact_phone.trim()) {
      errors.emergency_contact_phone = 'Emergency contact phone is required.'
    } else if (!isValidPhone(formData.emergency_contact_phone)) {
      errors.emergency_contact_phone = 'Enter a valid phone number.'
    }
    const seenPhones = new Set([formData.emergency_contact_phone.replace(/\D/g, '')])
    formData.relatives.forEach((relative, index) => {
      if (!relative.name.trim()) errors[`relative_${index}_name`] = 'Name is required.'
      if (!relative.relationship.trim()) errors[`relative_${index}_relationship`] = 'Relationship is required.'
      if (!relative.phone.trim() || !isValidPhone(relative.phone)) {
        errors[`relative_${index}_phone`] = 'Enter a valid phone number.'
      } else {
        const normalized = relative.phone.replace(/\D/g, '')
        if (seenPhones.has(normalized)) errors[`relative_${index}_phone`] = 'Phone numbers must be unique.'
        seenPhones.add(normalized)
      }
    })
  }

  return errors
}

const labelFor = (options, value) => options.find((o) => o.value === value)?.label || '—'
const labelsFor = (options, values) =>
  values && values.length
    ? values.map((v) => options.find((o) => o.value === v)?.label || v).join(', ')
    : '—'

// Uses OpenStreetMap's free Nominatim endpoint for forward/reverse geocoding
// so the page works without any project API keys. Swap this for your
// production geocoding provider (e.g. Google Places) when wiring the backend.
async function geocodeAddress(query) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error('Geocoding request failed')
  const results = await res.json()
  if (!results.length) throw new Error('No matching location found')
  return {
    label: results[0].display_name,
    latitude: Number(results[0].lat),
    longitude: Number(results[0].lon),
  }
}

async function reverseGeocode(lat, lon) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error('Reverse geocoding request failed')
  const result = await res.json()
  return result.display_name || `${lat.toFixed(5)}, ${lon.toFixed(5)}`
}

/* ============================================================================
   SMALL SHARED FIELD PIECES
   ============================================================================ */

function SelectField({ id, label, value, onChange, options, error, required = true }) {
  return (
    <div className="hr-field">
      <label className="hr-field-label" htmlFor={id}>
        {label}
        {required && <span className="hr-required" aria-hidden="true">*</span>}
      </label>
      <select id={id} className={error ? 'has-error' : ''} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="" disabled>Select {label.toLowerCase()}</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
      {error && <p className="hr-field-error">{error}</p>}
    </div>
  )
}

function NumberField({ id, label, value, onChange, error, placeholder, min = 0, step = '1' }) {
  return (
    <div className="hr-field">
      <label className="hr-field-label" htmlFor={id}>
        {label}
        <span className="hr-required" aria-hidden="true">*</span>
      </label>
      <input
        id={id}
        type="number"
        inputMode="decimal"
        min={min}
        step={step}
        className={error ? 'has-error' : ''}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
      {error && <p className="hr-field-error">{error}</p>}
    </div>
  )
}

function ChipMultiSelectField({ label, options, selected, onToggle, error }) {
  return (
    <div className="hr-field hr-field-wide">
      <label className="hr-field-label">
        {label}
        <span className="hr-required" aria-hidden="true">*</span>
      </label>
      <div className={`hr-chip-grid ${error ? 'has-error' : ''}`} role="group" aria-label={label}>
        {options.map((option) => {
          const isSelected = selected.includes(option.value)
          return (
            <button
              type="button"
              key={option.value}
              className={`hr-chip hr-chip-plain ${isSelected ? 'is-selected' : ''}`}
              onClick={() => onToggle(option.value)}
              aria-pressed={isSelected}
            >
              <span className="hr-chip-label">{option.label}</span>
              {isSelected && (
                <span className="hr-chip-check">
                  <Check size={14} strokeWidth={2.5} />
                </span>
              )}
            </button>
          )
        })}
      </div>
      {error && <p className="hr-field-error">{error}</p>}
    </div>
  )
}

function ReviewRow({ label, value, wide = false }) {
  return (
    <div className={`hr-review-row ${wide ? 'hr-review-row-wide' : ''}`}>
      <span className="hr-review-row-label">{label}</span>
      <span className="hr-review-row-value">{value || '—'}</span>
    </div>
  )
}

function ReviewSection({ title, stepIndex, onEdit, children }) {
  return (
    <div className="hr-review-section">
      <div className="hr-review-section-head">
        <h3>{title}</h3>
        <button type="button" className="hr-review-edit" onClick={() => onEdit(stepIndex)}>
          <Pencil size={14} strokeWidth={1.8} />
          Edit
        </button>
      </div>
      <div className="hr-review-section-body hr-review-grid">{children}</div>
    </div>
  )
}

/* ============================================================================
   PROGRESS INDICATOR
   ============================================================================ */

function ProgressIndicator({ steps, currentStep }) {
  return (
    <ol className="hr-progress" aria-label="Registration progress">
      {steps.map((label, index) => {
        const stepNumber = index + 1
        const isComplete = index < currentStep
        const isCurrent = index === currentStep

        return (
          <li
            key={label}
            className={[
              'hr-progress-step',
              isComplete ? 'is-complete' : '',
              isCurrent ? 'is-current' : '',
            ].join(' ').trim()}
            aria-current={isCurrent ? 'step' : undefined}
          >
            <span className="hr-progress-marker">
              {isComplete ? <Check size={14} strokeWidth={2.5} /> : String(stepNumber).padStart(2, '0')}
            </span>
            <span className="hr-progress-label">{label}</span>
            {index < steps.length - 1 && <span className="hr-progress-line" aria-hidden="true" />}
          </li>
        )
      })}
    </ol>
  )
}

/* ============================================================================
   STEP 1 — LOCATION
   ============================================================================ */

function LocationStep({ formData, updateField, errors }) {
  const [query, setQuery] = useState(formData.location || '')
  const [status, setStatus] = useState('idle') // idle | searching | locating | error
  const [statusMessage, setStatusMessage] = useState('')

  const handleSearch = async (event) => {
    event.preventDefault()
    if (!query.trim()) return
    setStatus('searching')
    setStatusMessage('')
    try {
      const result = await geocodeAddress(query)
      updateField('location', result.label)
      updateField('latitude', result.latitude)
      updateField('longitude', result.longitude)
      setQuery(result.label)
      setStatus('idle')
    } catch {
      setStatus('error')
      setStatusMessage("We couldn't find that location. Try a more specific address, or set coordinates manually below.")
    }
  }

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      setStatus('error')
      setStatusMessage('Location services are not available on this device.')
      return
    }
    setStatus('locating')
    setStatusMessage('')
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords
        updateField('latitude', latitude)
        updateField('longitude', longitude)
        try {
          const label = await reverseGeocode(latitude, longitude)
          updateField('location', label)
          setQuery(label)
        } catch {
          const fallback = `Current location (${latitude.toFixed(5)}, ${longitude.toFixed(5)})`
          updateField('location', fallback)
          setQuery(fallback)
        }
        setStatus('idle')
      },
      () => {
        setStatus('error')
        setStatusMessage('We could not access your location. Check your browser permissions and try again.')
      }
    )
  }

  const handleClear = () => {
    setQuery('')
    updateField('location', '')
    updateField('latitude', '')
    updateField('longitude', '')
    setStatus('idle')
    setStatusMessage('')
  }

  return (
    <div className="hr-step">
      <h2 className="hr-step-title">Tell us where your household is</h2>
      <p className="hr-step-subtitle">
        Your location helps SentinelHome monitor nearby disaster hazards and provide relevant safety information.
      </p>

      <form className="hr-search" onSubmit={handleSearch} role="search">
        <label className="hr-field-label" htmlFor="location-search">
          Location
          <span className="hr-required" aria-hidden="true">*</span>
        </label>
        <div className={`hr-search-bar ${errors.location ? 'has-error' : ''}`}>
          <Search size={18} strokeWidth={1.8} className="hr-search-icon" aria-hidden="true" />
          <input
            id="location-search"
            type="text"
            placeholder="Search your location — street address or neighborhood"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
          />
          {query && (
            <button type="button" className="hr-search-clear" onClick={handleClear} aria-label="Clear location">
              <X size={16} strokeWidth={2} />
            </button>
          )}
          <button type="submit" className="hr-search-submit" disabled={status === 'searching'}>
            {status === 'searching' ? <Loader2 size={16} className="hr-spin" /> : 'Search'}
          </button>
        </div>
        {errors.location && <p className="hr-field-error">{errors.location}</p>}
      </form>

      <button type="button" className="hr-current-location" onClick={handleUseCurrentLocation} disabled={status === 'locating'}>
        {status === 'locating' ? <Loader2 size={16} className="hr-spin" /> : <LocateFixed size={16} strokeWidth={1.8} />}
        Use my current location
      </button>

      {statusMessage && <p className="hr-field-error hr-location-status-error">{statusMessage}</p>}

      <div className="hr-grid hr-grid-2 hr-coords-grid">
        <div className="hr-field">
          <label className="hr-field-label" htmlFor="manual-lat">
            Latitude
            <span className="hr-required" aria-hidden="true">*</span>
          </label>
          <input
            id="manual-lat"
            type="number"
            step="any"
            className={errors.latitude ? 'has-error' : ''}
            value={formData.latitude}
            onChange={(e) => updateField('latitude', e.target.value)}
            placeholder="Auto-filled from location — e.g. 27.7172"
          />
          {errors.latitude && <p className="hr-field-error">{errors.latitude}</p>}
        </div>
        <div className="hr-field">
          <label className="hr-field-label" htmlFor="manual-lng">
            Longitude
            <span className="hr-required" aria-hidden="true">*</span>
          </label>
          <input
            id="manual-lng"
            type="number"
            step="any"
            className={errors.longitude ? 'has-error' : ''}
            value={formData.longitude}
            onChange={(e) => updateField('longitude', e.target.value)}
            placeholder="Auto-filled from location — e.g. 85.3240"
          />
          {errors.longitude && <p className="hr-field-error">{errors.longitude}</p>}
        </div>
      </div>
      <p className="hr-field-hint">
        Latitude and longitude fill in automatically once you search or use your current location.
        Only edit these directly if the search can't find your address.
      </p>
    </div>
  )
}

/* ============================================================================
   STEP 2 — BUILDING
   ============================================================================ */

function BuildingStep({ formData, updateField, errors }) {
  const toggleSuperstructure = (value) => {
    const selected = formData.superstructure_materials
    const next = selected.includes(value)
      ? selected.filter((m) => m !== value)
      : [...selected, value]
    updateField('superstructure_materials', next)
  }

  return (
    <div className="hr-step">
      <h2 className="hr-step-title">Tell us about your home</h2>
      <p className="hr-step-subtitle">
        Building characteristics help SentinelHome estimate household-specific disaster risk.
      </p>

      <div className="hr-grid hr-grid-2">
        <SelectField
          id="building_type"
          label="Building type"
          value={formData.building_type}
          onChange={(v) => updateField('building_type', v)}
          options={BUILDING_TYPE_OPTIONS}
          error={errors.building_type}
        />
        <NumberField
          id="count_floors_pre_eq"
          label="Number of floors before event"
          value={formData.count_floors_pre_eq}
          onChange={(v) => updateField('count_floors_pre_eq', v)}
          error={errors.count_floors_pre_eq}
          placeholder="e.g. 2"
          min={1}
        />
        <NumberField
          id="age_building"
          label="Building age (years)"
          value={formData.age_building}
          onChange={(v) => updateField('age_building', v)}
          error={errors.age_building}
          placeholder="e.g. 15"
        />
        <NumberField
          id="plinth_area_sq_ft"
          label="Plinth area (sq ft)"
          value={formData.plinth_area_sq_ft}
          onChange={(v) => updateField('plinth_area_sq_ft', v)}
          error={errors.plinth_area_sq_ft}
          placeholder="e.g. 600"
          min={1}
          step="any"
        />
        <NumberField
          id="height_ft_pre_eq"
          label="Building height before event (ft)"
          value={formData.height_ft_pre_eq}
          onChange={(v) => updateField('height_ft_pre_eq', v)}
          error={errors.height_ft_pre_eq}
          placeholder="e.g. 18"
          min={1}
          step="any"
        />
        <SelectField
          id="foundation_type"
          label="Foundation type"
          value={formData.foundation_type}
          onChange={(v) => updateField('foundation_type', v)}
          options={FOUNDATION_TYPE_OPTIONS}
          error={errors.foundation_type}
        />
        <SelectField
          id="ground_floor_type"
          label="Ground floor type"
          value={formData.ground_floor_type}
          onChange={(v) => updateField('ground_floor_type', v)}
          options={GROUND_FLOOR_TYPE_OPTIONS}
          error={errors.ground_floor_type}
        />
        <SelectField
          id="roof_type"
          label="Roof type"
          value={formData.roof_type}
          onChange={(v) => updateField('roof_type', v)}
          options={ROOF_TYPE_OPTIONS}
          error={errors.roof_type}
        />
        <SelectField
          id="other_floor_type"
          label="Other floor type"
          value={formData.other_floor_type}
          onChange={(v) => updateField('other_floor_type', v)}
          options={OTHER_FLOOR_TYPE_OPTIONS}
          error={errors.other_floor_type}
        />
        <SelectField
          id="position"
          label="Position"
          value={formData.position}
          onChange={(v) => updateField('position', v)}
          options={POSITION_OPTIONS}
          error={errors.position}
        />
        <SelectField
          id="land_surface_condition"
          label="Land surface condition"
          value={formData.land_surface_condition}
          onChange={(v) => updateField('land_surface_condition', v)}
          options={LAND_SURFACE_OPTIONS}
          error={errors.land_surface_condition}
        />
        <SelectField
          id="plan_configuration"
          label="Plan configuration"
          value={formData.plan_configuration}
          onChange={(v) => updateField('plan_configuration', v)}
          options={PLAN_CONFIGURATION_OPTIONS}
          error={errors.plan_configuration}
        />
      </div>

      <ChipMultiSelectField
        label="Superstructure materials"
        options={SUPERSTRUCTURE_MATERIAL_OPTIONS}
        selected={formData.superstructure_materials}
        onToggle={toggleSuperstructure}
        error={errors.superstructure_materials}
      />
    </div>
  )
}

/* ============================================================================
   STEP 3 — HOUSEHOLD
   ============================================================================ */

function HouseholdStep({ formData, updateField, errors }) {
  return (
    <div className="hr-step">
      <h2 className="hr-step-title">Who are we protecting?</h2>
      <p className="hr-step-subtitle">
        Tell us who lives in the household so SentinelHome can personalize risk and emergency response.
      </p>

      <div className="hr-grid hr-grid-2">
        <div className="hr-field">
          <label className="hr-field-label" htmlFor="household_size">
            Number of people
            <span className="hr-required" aria-hidden="true">*</span>
          </label>
          <input
            id="household_size"
            type="number"
            inputMode="numeric"
            min={1}
            className={errors.household_size ? 'has-error' : ''}
            value={formData.household_size}
            onChange={(e) => updateField('household_size', e.target.value)}
            placeholder="e.g. 4"
          />
          {errors.household_size && <p className="hr-field-error">{errors.household_size}</p>}
        </div>

        <div className="hr-field">
          <label className="hr-field-label" htmlFor="household_name">
            Household name <span className="hr-optional">(optional)</span>
          </label>
          <input
            id="household_name"
            type="text"
            value={formData.household_name}
            onChange={(e) => updateField('household_name', e.target.value)}
            placeholder="e.g. The Sharma Family"
          />
        </div>
      </div>
    </div>
  )
}

/* ============================================================================
   STEP 4 — VULNERABILITY
   ============================================================================ */

function VulnerabilityStep({ formData, updateField }) {
  const selected = formData.vulnerable_members

  const toggleMember = (id) => {
    if (id === 'none') {
      updateField('vulnerable_members', selected.includes('none') ? [] : ['none'])
      return
    }
    const withoutNone = selected.filter((m) => m !== 'none')
    const next = withoutNone.includes(id)
      ? withoutNone.filter((m) => m !== id)
      : [...withoutNone, id]
    updateField('vulnerable_members', next)
  }

  return (
    <div className="hr-step">
      <h2 className="hr-step-title">Does anyone need additional assistance?</h2>
      <p className="hr-step-subtitle">
        This helps SentinelHome provide more appropriate emergency guidance.
      </p>

      <div className="hr-chip-grid" role="group" aria-label="Vulnerable household members">
        {VULNERABLE_MEMBER_OPTIONS.map((option) => {
          const Icon = option.icon
          const isSelected = selected.includes(option.id)
          return (
            <button
              type="button"
              key={option.id}
              className={`hr-chip ${isSelected ? 'is-selected' : ''}`}
              onClick={() => toggleMember(option.id)}
              aria-pressed={isSelected}
            >
              <span className="hr-chip-icon">
                <Icon size={20} strokeWidth={1.8} />
              </span>
              <span className="hr-chip-text">
                <span className="hr-chip-label">{option.label}</span>
                <span className="hr-chip-desc">{option.description}</span>
              </span>
              {isSelected && (
                <span className="hr-chip-check">
                  <Check size={14} strokeWidth={2.5} />
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* ============================================================================
   STEP 5 — EMERGENCY CONTACT
   ============================================================================ */

function EmergencyContactStep({ formData, updateField, errors }) {
  const updateRelative = (index, field, value) => {
    const relatives = formData.relatives.map((relative, relativeIndex) =>
      relativeIndex === index ? { ...relative, [field]: value } : relative,
    )
    updateField('relatives', relatives)
  }

  const addRelative = () => updateField('relatives', [
    ...formData.relatives,
    { name: '', relationship: '', phone: '', receive_call: true },
  ])

  const removeRelative = (index) => updateField(
    'relatives', formData.relatives.filter((_, relativeIndex) => relativeIndex !== index),
  )

  return (
    <div className="hr-step">
      <h2 className="hr-step-title">Set up emergency contacts</h2>
      <p className="hr-step-subtitle">
        The primary contact receives the first WhatsApp alert. Relatives are called only if the alert escalates.
      </p>

      <div className="hr-grid hr-grid-2">
        <div className="hr-field">
          <label className="hr-field-label" htmlFor="emergency_contact_name">
            Primary contact name
            <span className="hr-required" aria-hidden="true">*</span>
          </label>
          <input
            id="emergency_contact_name"
            type="text"
            className={errors.emergency_contact_name ? 'has-error' : ''}
            value={formData.emergency_contact_name}
            onChange={(e) => updateField('emergency_contact_name', e.target.value)}
            placeholder="Full name"
          />
          {errors.emergency_contact_name && <p className="hr-field-error">{errors.emergency_contact_name}</p>}
        </div>

        <div className="hr-field">
          <label className="hr-field-label" htmlFor="emergency_contact_phone">
            Primary contact phone
            <span className="hr-required" aria-hidden="true">*</span>
          </label>
          <input
            id="emergency_contact_phone"
            type="tel"
            className={errors.emergency_contact_phone ? 'has-error' : ''}
            value={formData.emergency_contact_phone}
            onChange={(e) => updateField('emergency_contact_phone', e.target.value)}
            placeholder="e.g. +91 98765 43210"
          />
          {errors.emergency_contact_phone && <p className="hr-field-error">{errors.emergency_contact_phone}</p>}
        </div>
      </div>

      <div className="hr-note">
        <ShieldCheck size={18} strokeWidth={1.8} />
        <p>WhatsApp alerts are sent to the primary contact. Add relatives for voice-call escalation.</p>
      </div>

      <div className="hr-section-heading">
        <h3>Relatives for escalation</h3>
        <button type="button" className="hr-secondary-button" onClick={addRelative}>Add relative</button>
      </div>
      {formData.relatives.map((relative, index) => (
        <div className="hr-grid hr-grid-2" key={index}>
          <div className="hr-field">
            <label className="hr-field-label">Name</label>
            <input type="text" value={relative.name} onChange={(e) => updateRelative(index, 'name', e.target.value)} />
            {errors[`relative_${index}_name`] && <p className="hr-field-error">{errors[`relative_${index}_name`]}</p>}
          </div>
          <div className="hr-field">
            <label className="hr-field-label">Relationship</label>
            <input type="text" value={relative.relationship} onChange={(e) => updateRelative(index, 'relationship', e.target.value)} placeholder="e.g. father" />
            {errors[`relative_${index}_relationship`] && <p className="hr-field-error">{errors[`relative_${index}_relationship`]}</p>}
          </div>
          <div className="hr-field">
            <label className="hr-field-label">Phone</label>
            <input type="tel" value={relative.phone} onChange={(e) => updateRelative(index, 'phone', e.target.value)} placeholder="e.g. +91 98765 43210" />
            {errors[`relative_${index}_phone`] && <p className="hr-field-error">{errors[`relative_${index}_phone`]}</p>}
          </div>
          <div className="hr-field">
            <label className="hr-checkbox-label">
              <input type="checkbox" checked={relative.receive_call} onChange={(e) => updateRelative(index, 'receive_call', e.target.checked)} />
              Call this relative during escalation
            </label>
            <button type="button" className="hr-text-button" onClick={() => removeRelative(index)}>Remove</button>
          </div>
        </div>
      ))}

      <div className="hr-note">
        <ShieldAlert size={18} strokeWidth={1.8} />
        <p>Your emergency contact information is used for SentinelHome emergency communication and escalation.</p>
      </div>
    </div>
  )
}

/* ============================================================================
   STEP 6 — REVIEW
   ============================================================================ */

function ReviewStep({ formData, goToStep }) {
  const vulnerableLabels = formData.vulnerable_members.length
    ? formData.vulnerable_members
        .map((id) => VULNERABLE_MEMBER_OPTIONS.find((o) => o.id === id)?.label)
        .filter(Boolean)
        .join(', ')
    : 'None selected'

  return (
    <div className="hr-step">
      <h2 className="hr-step-title">Review your household profile</h2>
      <p className="hr-step-subtitle">
        Confirm everything looks right before SentinelHome creates your household.
      </p>

      <ReviewSection title="Location" stepIndex={0} onEdit={goToStep}>
        <ReviewRow label="Selected location" value={formData.location} />
        <ReviewRow label="Latitude" value={formData.latitude !== '' ? Number(formData.latitude).toFixed(5) : ''} />
        <ReviewRow label="Longitude" value={formData.longitude !== '' ? Number(formData.longitude).toFixed(5) : ''} />
      </ReviewSection>

      <ReviewSection title="Building" stepIndex={1} onEdit={goToStep}>
        <ReviewRow label="Building type" value={formData.building_type} />
        <ReviewRow label="Floors before event" value={formData.count_floors_pre_eq} />
        <ReviewRow label="Building age" value={formData.age_building && `${formData.age_building} years`} />
        <ReviewRow label="Plinth area" value={formData.plinth_area_sq_ft && `${formData.plinth_area_sq_ft} sq ft`} />
        <ReviewRow label="Building height" value={formData.height_ft_pre_eq && `${formData.height_ft_pre_eq} ft`} />
        <ReviewRow label="Foundation" value={labelFor(FOUNDATION_TYPE_OPTIONS, formData.foundation_type)} />
        <ReviewRow label="Ground floor" value={labelFor(GROUND_FLOOR_TYPE_OPTIONS, formData.ground_floor_type)} />
        <ReviewRow label="Other floor type" value={labelFor(OTHER_FLOOR_TYPE_OPTIONS, formData.other_floor_type)} />
        <ReviewRow label="Roof" value={labelFor(ROOF_TYPE_OPTIONS, formData.roof_type)} />
        <ReviewRow label="Position" value={labelFor(POSITION_OPTIONS, formData.position)} />
        <ReviewRow label="Land surface" value={labelFor(LAND_SURFACE_OPTIONS, formData.land_surface_condition)} />
        <ReviewRow label="Plan configuration" value={labelFor(PLAN_CONFIGURATION_OPTIONS, formData.plan_configuration)} />
        <ReviewRow label="Superstructure materials" value={labelsFor(SUPERSTRUCTURE_MATERIAL_OPTIONS, formData.superstructure_materials)} wide />
      </ReviewSection>

      <ReviewSection title="Household" stepIndex={2} onEdit={goToStep}>
        <ReviewRow label="Household size" value={formData.household_size && `${formData.household_size} people`} />
        {formData.household_name && <ReviewRow label="Household name" value={formData.household_name} />}
        <ReviewRow label="Vulnerable members" value={vulnerableLabels} wide />
      </ReviewSection>

      <ReviewSection title="Emergency contact" stepIndex={4} onEdit={goToStep}>
        <ReviewRow label="Name" value={formData.emergency_contact_name} />
        <ReviewRow label="Phone" value={formData.emergency_contact_phone} />
        <ReviewRow label="Escalation relatives" value={formData.relatives.length ? formData.relatives.map((relative) => `${relative.name} (${relative.relationship})`).join(', ') : 'None selected'} wide />
      </ReviewSection>
    </div>
  )
}

/* ============================================================================
   PAGE
   ============================================================================ */

export default function HouseholdRegistration() {
  const navigate = useNavigate()
  const [currentStep, setCurrentStep] = useState(0)
  const [formData, setFormData] = useState(initialFormData)
  const [errors, setErrors] = useState({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [accountEmail, setAccountEmail] = useState('')
  const [accountPassword, setAccountPassword] = useState('')
  const [telegramConnected, setTelegramConnected] = useState(false)
  const [telegramLinking, setTelegramLinking] = useState(false)
  const [telegramError, setTelegramError] = useState('')
  const [telegramUrl, setTelegramUrl] = useState('')

  const isReviewStep = currentStep === STEP_LABELS.length - 1

  const updateField = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev }
        delete next[field]
        return next
      })
    }
  }

  const goToStep = (index) => {
    setErrors({})
    setCurrentStep(index)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleNext = () => {
    const stepErrors = validateStep(currentStep, formData)
    if (Object.keys(stepErrors).length > 0) {
      setErrors(stepErrors)
      return
    }
    setErrors({})
    setCurrentStep((prev) => Math.min(prev + 1, STEP_LABELS.length - 1))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleBack = () => {
    setErrors({})
    setCurrentStep((prev) => Math.max(prev - 1, 0))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const ensureAccount = async () => {
    if (!accountEmail || accountPassword.length < 8) {
      throw new Error('Enter an email and a password of at least 8 characters before connecting Telegram.')
    }
    try {
      await registerAccount(accountEmail, accountPassword)
    } catch (accountError) {
      if (!accountError.message.toLowerCase().includes('already exists')) throw accountError
      // A user who already created the account during an interrupted signup
      // can resume with the same credentials after a refresh or redirect.
      await loginAccount(accountEmail, accountPassword)
    }
  }

  const connectTelegram = async () => {
    setTelegramError('')
    setTelegramLinking(true)
    let telegramWindow
    try {
      // Open synchronously from the button click so browsers do not block it.
      telegramWindow = window.open('', '_blank', 'noopener,noreferrer')
      await ensureAccount()
      const existing = await getTelegramLinkStatus()
      if (existing.telegram_connected) {
        setTelegramConnected(true)
        telegramWindow?.close()
        return true
      }

      const link = await startTelegramLink()
      setTelegramUrl(link.telegram_url)
      if (telegramWindow) telegramWindow.location.href = link.telegram_url

      for (let attempt = 0; attempt < 60; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 2000))
        const status = await getTelegramLinkStatus()
        if (status.telegram_connected) {
          setTelegramConnected(true)
          setTelegramError('')
          return true
        }
      }
      throw new Error('Telegram linking timed out. Open the link again to retry.')
    } catch (error) {
      telegramWindow?.close()
      setTelegramError(error.message)
      return false
    } finally {
      setTelegramLinking(false)
    }
  }

  const handleSubmit = async () => {
    const stepErrors = validateStep(currentStep, formData)
    if (Object.keys(stepErrors).length > 0) {
      setErrors(stepErrors)
      return
    }

    const payload = {
      location: formData.location,
      latitude: Number(formData.latitude),
      longitude: Number(formData.longitude),
      building_type: formData.building_type,
      household_size: Number(formData.household_size),
      household_name: formData.household_name || undefined,
      emergency_contact: {
        name: formData.emergency_contact_name,
        phone: formData.emergency_contact_phone,
      },
      primary_contact: {
        name: formData.emergency_contact_name,
        phone: formData.emergency_contact_phone,
      },
      relatives: formData.relatives,
      vulnerable_members: formData.vulnerable_members,
      count_floors_pre_eq: Number(formData.count_floors_pre_eq),
      age_building: Number(formData.age_building),
      plinth_area_sq_ft: Number(formData.plinth_area_sq_ft),
      height_ft_pre_eq: Number(formData.height_ft_pre_eq),
      foundation_type: formData.foundation_type,
      ground_floor_type: formData.ground_floor_type,
      roof_type: formData.roof_type,
      other_floor_type: formData.other_floor_type,
      position: formData.position,
      land_surface_condition: formData.land_surface_condition,
      plan_configuration: formData.plan_configuration,
      superstructure_materials: formData.superstructure_materials,
    }

    setIsSubmitting(true)
    try {
      if (!telegramConnected) {
        await connectTelegram()
        return
      }
      const result = await registerHousehold(payload)
      navigate(`/dashboard/${result.household.id}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  const renderStep = () => {
    switch (currentStep) {
      case 0:
        return <LocationStep formData={formData} updateField={updateField} errors={errors} />
      case 1:
        return <BuildingStep formData={formData} updateField={updateField} errors={errors} />
      case 2:
        return <HouseholdStep formData={formData} updateField={updateField} errors={errors} />
      case 3:
        return <VulnerabilityStep formData={formData} updateField={updateField} errors={errors} />
      case 4:
        return <EmergencyContactStep formData={formData} updateField={updateField} errors={errors} />
      case 5:
        return <ReviewStep formData={formData} goToStep={goToStep} />
      default:
        return null
    }
  }

  return (
    <main className="hr-page">
      <style>{`
/* SentinelHome — Household Registration
   Scoped with the \`hr-\` prefix so nothing here collides with the existing
   Home page styles in App.css. Mirrors the Home page's dark, cinematic,
   command-center visual language: navy/charcoal base, cool blue + muted
   cyan accents, glass panels, restrained motion. */

.hr-page {
  --hr-bg: #070b14;
  --hr-bg-elevated: #0c1220;
  --hr-panel: rgba(255, 255, 255, 0.035);
  --hr-panel-strong: rgba(255, 255, 255, 0.055);
  --hr-border: rgba(255, 255, 255, 0.09);
  --hr-border-soft: rgba(255, 255, 255, 0.06);
  --hr-text: #eef2f8;
  --hr-text-muted: #93a0b4;
  --hr-text-faint: #5c6a80;
  --hr-blue: #4c8dff;
  --hr-cyan: #35d0e0;
  --hr-accent-gradient: linear-gradient(120deg, #4c8dff 0%, #35d0e0 100%);
  --hr-danger: #f2837a;
  --hr-radius-lg: 20px;
  --hr-radius-md: 14px;
  --hr-radius-sm: 10px;

  position: relative;
  height: 100vh;
  background: var(--hr-bg);
  color: var(--hr-text);
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  overflow-x: hidden;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

.hr-backdrop {
  position: fixed;
  inset: 0;
  z-index: 0;
  background:
    radial-gradient(60vw 60vh at 12% -10%, rgba(76, 141, 255, 0.16), transparent 60%),
    radial-gradient(50vw 50vh at 100% 10%, rgba(53, 208, 224, 0.10), transparent 55%),
    linear-gradient(180deg, rgba(7, 11, 20, 0.55) 0%, rgba(7, 11, 20, 0.72) 60%, var(--hr-bg) 100%),
    url('/assets/regis-img.png');
  background-size: cover, cover, cover, cover;
  background-position: center, center, center, center;
  background-repeat: no-repeat, no-repeat, no-repeat, no-repeat;
  background-attachment: fixed, fixed, fixed, fixed;
  pointer-events: none;
}

/* ---------- Topbar ---------- */

.hr-topbar {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  padding: 24px clamp(20px, 5vw, 56px) 0;
}

.hr-brand {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  text-decoration: none;
  color: inherit;
}

.hr-brand-mark {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: var(--hr-panel-strong);
  border: 1px solid var(--hr-border);
  color: var(--hr-cyan);
}

.hr-brand-copy {
  display: flex;
  flex-direction: column;
  line-height: 1.25;
}

.hr-brand-copy strong {
  font-size: 16px;
  font-weight: 600;
  letter-spacing: -0.01em;
}

.hr-brand-copy small {
  font-size: 12px;
  color: var(--hr-text-muted);
}

/* ---------- Layout ---------- */

.hr-layout {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: minmax(260px, 320px) minmax(0, 1200px);
  gap: clamp(24px, 4vw, 56px);
  align-items: start;
  max-width: 1640px;
  margin: 0 auto;
  padding: clamp(32px, 5vw, 56px) clamp(20px, 5vw, 56px) 80px;
}

@media (max-width: 1300px) {
  .hr-layout {
    grid-template-columns: minmax(240px, 300px) minmax(0, 1fr);
  }
}

@media (max-width: 900px) {
  .hr-layout {
    grid-template-columns: 1fr;
  }
}

/* ---------- Context panel (left) ---------- */

.hr-context-panel {
  position: sticky;
  top: 32px;
}

@media (max-width: 900px) {
  .hr-context-panel {
    position: static;
  }
}

.hr-context-inner {
  padding: 28px 26px;
  border-radius: 0;
  border: 1px solid var(--hr-border-soft);
  background: var(--hr-panel);
}

.hr-context-inner h1 {
  margin: 0 0 12px;
  font-size: clamp(22px, 2.4vw, 27px);
  line-height: 1.28;
  font-weight: 600;
  letter-spacing: -0.01em;
}

.hr-context-inner p {
  margin: 0 0 28px;
  color: var(--hr-text-muted);
  font-size: 14.5px;
  line-height: 1.6;
}

.hr-flow {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}

.hr-flow-item {
  display: flex;
  align-items: center;
  gap: 12px;
  position: relative;
  padding-bottom: 20px;
}

.hr-flow-item:last-child {
  padding-bottom: 0;
}

.hr-flow-icon {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  flex-shrink: 0;
  border-radius: 10px;
  background: var(--hr-panel-strong);
  border: 1px solid var(--hr-border);
  color: var(--hr-cyan);
  z-index: 1;
}

.hr-flow-label {
  font-size: 14px;
  font-weight: 500;
  color: var(--hr-text);
}

.hr-flow-connector {
  position: absolute;
  left: 17px;
  top: 34px;
  width: 1px;
  height: 20px;
  background: var(--hr-border);
}

/* ---------- Form panel (right) ---------- */

.hr-form-panel {
  min-width: 0;
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
}

/* ---------- Progress indicator ---------- */

.hr-progress {
  list-style: none;
  display: flex;
  align-items: flex-start;
  margin: 0 0 24px;
  padding: 18px 20px;
  border-radius: 0;
  border: 1px solid var(--hr-border-soft);
  background: var(--hr-panel);
  overflow-x: auto;
}

.hr-progress-step {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  flex: 1;
  min-width: 64px;
  gap: 8px;
}

.hr-progress-marker {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 999px;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--hr-text-faint);
  background: var(--hr-bg-elevated);
  border: 1px solid var(--hr-border);
  z-index: 1;
}

.hr-progress-step.is-current .hr-progress-marker {
  color: #06121f;
  background: var(--hr-accent-gradient);
  border-color: transparent;
}

.hr-progress-step.is-complete .hr-progress-marker {
  color: var(--hr-cyan);
  background: var(--hr-bg-elevated);
  border-color: rgba(53, 208, 224, 0.5);
}

.hr-progress-label {
  font-size: 11px;
  text-align: center;
  color: var(--hr-text-faint);
  white-space: nowrap;
}

.hr-progress-step.is-current .hr-progress-label {
  color: var(--hr-text);
}

.hr-progress-step.is-complete .hr-progress-label {
  color: var(--hr-text-muted);
}

.hr-progress-line {
  position: absolute;
  top: 14px;
  left: 50%;
  width: 100%;
  height: 1px;
  background: var(--hr-border);
  z-index: 0;
}

.hr-progress-step.is-complete .hr-progress-line {
  background: rgba(53, 208, 224, 0.4);
}

/* ---------- Form card ---------- */

.hr-form-card {
  padding: clamp(24px, 4vw, 40px);
  border-radius: 0;
  border: 1px solid var(--hr-border);
  background: var(--hr-panel);
  backdrop-filter: blur(18px);
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.35);
}

.hr-step-title {
  margin: 0 0 8px;
  font-size: clamp(20px, 2.6vw, 25px);
  font-weight: 600;
  letter-spacing: -0.01em;
}

.hr-step-subtitle {
  margin: 0 0 28px;
  font-size: 14.5px;
  line-height: 1.6;
  color: var(--hr-text-muted);
  max-width: 56ch;
}

/* ---------- Fields ---------- */

.hr-grid {
  display: grid;
  gap: 18px;
}

.hr-grid-2 {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

@media (max-width: 640px) {
  .hr-grid-2 {
    grid-template-columns: 1fr;
  }
}

.hr-field {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.hr-field-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--hr-text-muted);
}

.hr-required {
  color: var(--hr-cyan);
  margin-left: 4px;
}

.hr-optional {
  color: var(--hr-text-faint);
  font-weight: 400;
}

.hr-field input,
.hr-field select {
  width: 100%;
  min-height: 46px;
  box-sizing: border-box;
  padding: 12px 14px;
  font-size: 14.5px;
  color: var(--hr-text);
  background: var(--hr-bg-elevated);
  border: 1px solid var(--hr-border);
  border-radius: var(--hr-radius-sm);
  outline: none;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
  font-family: inherit;
}

.hr-field input::placeholder {
  color: var(--hr-text-faint);
}

.hr-field input:focus,
.hr-field select:focus {
  border-color: var(--hr-blue);
  box-shadow: 0 0 0 3px rgba(76, 141, 255, 0.18);
}

.hr-field input.has-error,
.hr-field select.has-error {
  border-color: var(--hr-danger);
}

.hr-field select {
  appearance: none;
  background-image: linear-gradient(45deg, transparent 50%, var(--hr-text-muted) 50%),
    linear-gradient(135deg, var(--hr-text-muted) 50%, transparent 50%);
  background-position: calc(100% - 18px) calc(50% - 3px), calc(100% - 13px) calc(50% - 3px);
  background-size: 5px 5px, 5px 5px;
  background-repeat: no-repeat;
}

.hr-field-error {
  margin: 0;
  font-size: 12.5px;
  color: var(--hr-danger);
}

.hr-note {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  margin-top: 24px;
  padding: 14px 16px;
  border-radius: var(--hr-radius-sm);
  border: 1px solid var(--hr-border-soft);
  background: rgba(76, 141, 255, 0.06);
  color: var(--hr-text-muted);
}

.hr-note svg {
  flex-shrink: 0;
  color: var(--hr-cyan);
  margin-top: 1px;
}

.hr-note p {
  margin: 0;
  font-size: 13px;
  line-height: 1.55;
}

/* ---------- Location step ---------- */

.hr-search {
  margin-bottom: 14px;
}

.hr-search-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 6px 6px 14px;
  background: var(--hr-bg-elevated);
  border: 1px solid var(--hr-border);
  border-radius: var(--hr-radius-sm);
  transition: border-color 0.15s ease;
}

.hr-search-bar:focus-within {
  border-color: var(--hr-blue);
}

.hr-search-bar.has-error {
  border-color: var(--hr-danger);
}

.hr-search-icon {
  color: var(--hr-text-faint);
  flex-shrink: 0;
}

.hr-search-bar input {
  flex: 1;
  min-width: 0;
  border: none;
  background: transparent;
  color: var(--hr-text);
  font-size: 14.5px;
  padding: 8px 0;
  outline: none;
  font-family: inherit;
}

.hr-search-bar input::placeholder {
  color: var(--hr-text-faint);
}

.hr-search-clear {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  border-radius: 999px;
  border: none;
  background: transparent;
  color: var(--hr-text-faint);
  cursor: pointer;
  flex-shrink: 0;
}

.hr-search-clear:hover {
  color: var(--hr-text);
}

.hr-search-submit {
  flex-shrink: 0;
  padding: 9px 16px;
  border-radius: 8px;
  border: none;
  background: var(--hr-accent-gradient);
  color: #06121f;
  font-size: 13.5px;
  font-weight: 600;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.hr-search-submit:disabled {
  opacity: 0.7;
  cursor: default;
}

.hr-current-location {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 18px;
  padding: 9px 14px;
  border-radius: var(--hr-radius-sm);
  border: 1px solid var(--hr-border);
  background: transparent;
  color: var(--hr-text-muted);
  font-size: 13.5px;
  font-weight: 500;
  cursor: pointer;
  transition: border-color 0.15s ease, color 0.15s ease;
}

.hr-current-location:hover {
  border-color: var(--hr-blue);
  color: var(--hr-text);
}

.hr-coords-grid {
  margin-top: 4px;
}

.hr-field-hint {
  margin: 12px 0 0;
  font-size: 12.5px;
  line-height: 1.55;
  color: var(--hr-text-faint);
}

.hr-current-location:disabled {
  opacity: 0.6;
  cursor: default;
}

.hr-location-status-error {
  margin-bottom: 14px;
}

.hr-location-confirmed {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  padding: 16px 18px;
  border-radius: var(--hr-radius-sm);
  border: 1px solid rgba(53, 208, 224, 0.35);
  background: rgba(53, 208, 224, 0.06);
  margin-bottom: 8px;
}

.hr-location-confirmed-icon {
  color: var(--hr-cyan);
  margin-top: 1px;
  flex-shrink: 0;
}

.hr-location-confirmed-title {
  margin: 0 0 4px;
  font-size: 14px;
  font-weight: 600;
}

.hr-location-confirmed-coords {
  margin: 0;
  font-size: 13px;
  color: var(--hr-text-muted);
}

.hr-location-empty {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 18px;
  border-radius: var(--hr-radius-sm);
  border: 1px dashed var(--hr-border);
  color: var(--hr-text-faint);
  font-size: 13.5px;
  margin-bottom: 8px;
}

.hr-manual-toggle {
  display: inline-block;
  margin-top: 10px;
  padding: 0;
  border: none;
  background: none;
  color: var(--hr-blue);
  font-size: 13px;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 3px;
}

.hr-manual-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  margin-top: 16px;
}

@media (max-width: 640px) {
  .hr-manual-grid {
    grid-template-columns: 1fr;
  }
}

.hr-spin {
  animation: hr-spin 0.9s linear infinite;
}

@keyframes hr-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* ---------- Vulnerability chips ---------- */

.hr-chip-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.hr-chip-grid.has-error {
  outline: 1px solid var(--hr-danger);
  outline-offset: 6px;
  border-radius: var(--hr-radius-md);
}

.hr-field-wide {
  margin-top: 22px;
}

.hr-chip-plain {
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
}

@media (max-width: 640px) {
  .hr-chip-grid {
    grid-template-columns: 1fr;
  }
}

.hr-chip {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 16px;
  text-align: left;
  border-radius: var(--hr-radius-md);
  border: 1px solid var(--hr-border);
  background: var(--hr-bg-elevated);
  color: var(--hr-text);
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease;
}

.hr-chip:hover {
  border-color: rgba(76, 141, 255, 0.5);
}

.hr-chip.is-selected {
  border-color: var(--hr-cyan);
  background: rgba(53, 208, 224, 0.07);
}

.hr-chip-icon {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  border-radius: 10px;
  background: var(--hr-panel-strong);
  color: var(--hr-cyan);
}

.hr-chip-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.hr-chip-label {
  font-size: 14px;
  font-weight: 600;
}

.hr-chip-desc {
  font-size: 12.5px;
  color: var(--hr-text-muted);
  line-height: 1.4;
}

.hr-chip-check {
  position: absolute;
  top: 12px;
  right: 12px;
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  border-radius: 999px;
  background: var(--hr-accent-gradient);
  color: #06121f;
}

/* ---------- Review step ---------- */

.hr-review-section {
  margin-bottom: 22px;
  padding-bottom: 22px;
  border-bottom: 1px solid var(--hr-border-soft);
}

.hr-review-section:last-child {
  margin-bottom: 0;
  padding-bottom: 0;
  border-bottom: none;
}

.hr-review-section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.hr-review-section-head h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--hr-text);
}

.hr-review-edit {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  border-radius: 8px;
  border: 1px solid var(--hr-border);
  background: transparent;
  color: var(--hr-text-muted);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
}

.hr-review-edit:hover {
  color: var(--hr-cyan);
  border-color: var(--hr-cyan);
}

.hr-review-row {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 7px 0;
  font-size: 13.5px;
}

.hr-review-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  column-gap: 32px;
}

.hr-review-row-wide {
  grid-column: 1 / -1;
}

@media (max-width: 640px) {
  .hr-review-grid {
    grid-template-columns: 1fr;
  }
}

.hr-review-row-label {
  color: var(--hr-text-faint);
}

.hr-review-row-value {
  color: var(--hr-text);
  text-align: right;
  max-width: 60%;
}

/* ---------- Nav row / buttons ---------- */

.hr-nav-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 32px;
  padding-top: 24px;
  border-top: 1px solid var(--hr-border-soft);
}

.hr-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 12px 22px;
  font-size: 14px;
  font-weight: 600;
  border-radius: 999px;
  cursor: pointer;
  border: 1px solid transparent;
  font-family: inherit;
  transition: opacity 0.15s ease, border-color 0.15s ease, background 0.15s ease;
}

.hr-btn-primary {
  background: var(--hr-accent-gradient);
  color: #06121f;
}

.hr-btn-primary:hover {
  opacity: 0.92;
}

.hr-btn-primary:disabled {
  opacity: 0.6;
  cursor: default;
}

.hr-btn-secondary {
  background: transparent;
  border-color: var(--hr-border);
  color: var(--hr-text-muted);
}

.hr-btn-secondary:hover:not(:disabled) {
  border-color: var(--hr-text-muted);
  color: var(--hr-text);
}

.hr-btn-secondary:disabled {
  opacity: 0.4;
  cursor: default;
}

.telegram-registration-panel {
  margin-top: 18px;
  padding-top: 16px;
  border-top: 1px solid var(--hr-border-soft);
}

.telegram-registration-panel p {
  margin: 6px 0 10px;
  color: var(--hr-text-muted);
  line-height: 1.5;
}

/* ---------- Accessibility ---------- */

.hr-page :focus-visible {
  outline: 2px solid var(--hr-cyan);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  .hr-spin {
    animation: none;
  }
}

`}</style>
      <div className="hr-backdrop" aria-hidden="true" />

      <header className="hr-topbar">
        <Link className="hr-brand" to="/" aria-label="SentinelHome home">
          <span className="hr-brand-mark" aria-hidden="true">
            <ShieldCheck size={24} strokeWidth={1.8} />
          </span>
          <span className="hr-brand-copy">
            <strong>SentinelHome</strong>
            <small>Household onboarding</small>
          </span>
        </Link>
      </header>

      <div className="hr-layout">
        <aside className="hr-context-panel">
          <div className="hr-context-inner">
            <h1>Protect your household before the emergency.</h1>
            <p>
              Complete your household profile so SentinelHome can understand your location,
              building characteristics and household needs.
            </p>

            <ol className="hr-flow">
              {FLOW_STAGES.map((stage, index) => {
                const Icon = stage.icon
                return (
                  <li key={stage.label} className="hr-flow-item">
                    <span className="hr-flow-icon">
                      <Icon size={18} strokeWidth={1.8} />
                    </span>
                    <span className="hr-flow-label">{stage.label}</span>
                    {index < FLOW_STAGES.length - 1 && <span className="hr-flow-connector" aria-hidden="true" />}
                  </li>
                )
              })}
            </ol>
          </div>
        </aside>

        <section className="hr-form-panel">
          <ProgressIndicator steps={STEP_LABELS} currentStep={currentStep} />

          <div className="hr-form-card">
            <div className="account-registration-panel">
              <span className="eyebrow">YOUR PRIVATE ACCOUNT</span>
              <p>Create this once to return to your household dashboard without registering again.</p>
              <div className="account-registration-fields">
                <label>Email<input type="email" value={accountEmail} onChange={(e) => setAccountEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" /></label>
                <label>Password<input type="password" value={accountPassword} onChange={(e) => setAccountPassword(e.target.value)} placeholder="At least 8 characters" autoComplete="new-password" /></label>
              </div>
              <small>Already registered? <a href="/login">Sign in instead</a></small>
              <div className="telegram-registration-panel">
                <span className="eyebrow">REQUIRED FOR SAFETY ALERTS</span>
                <p>
                  Connect Telegram before completing registration so SentinelHome can deliver
                  earthquake alerts to this account.
                </p>
                <button
                  type="button"
                  className="hr-btn hr-btn-secondary"
                  onClick={connectTelegram}
                  disabled={isSubmitting || telegramLinking}
                >
                  {telegramLinking ? 'Waiting for Telegram…' : telegramConnected ? 'Telegram connected ✓' : 'Connect Telegram'}
                </button>
                {telegramUrl && !telegramConnected && (
                  <p><a href={telegramUrl} target="_blank" rel="noreferrer">Open Telegram link again</a></p>
                )}
                {telegramError && <p className="hr-field-error">{telegramError}</p>}
              </div>
            </div>
            {renderStep()}

            <div className="hr-nav-row">
              <button
                type="button"
                className="hr-btn hr-btn-secondary"
                onClick={handleBack}
                disabled={currentStep === 0}
              >
                <ChevronLeft size={18} strokeWidth={1.8} />
                Back
              </button>

              {isReviewStep ? (
                <button
                  type="button"
                  className="hr-btn hr-btn-primary"
                  onClick={handleSubmit}
                  disabled={isSubmitting || !telegramConnected}
                >
                  {isSubmitting ? 'Submitting…' : telegramConnected ? 'Complete Registration' : 'Connect Telegram to continue'}
                  {!isSubmitting && telegramConnected && <ChevronRight size={18} strokeWidth={1.8} />}
                </button>
              ) : (
                <button type="button" className="hr-btn hr-btn-primary" onClick={handleNext}>
                  Continue
                  <ChevronRight size={18} strokeWidth={1.8} />
                </button>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}
