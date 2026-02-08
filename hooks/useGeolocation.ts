'use client';

import { useState, useCallback } from 'react';

interface LocationResult {
  city: string;
  coords: {
    lat: number;
    lng: number;
  };
}

interface GeolocationState {
  loading: boolean;
  error: string | null;
}

// Google Geocoding API key (optional - falls back to Nominatim if not set)
const GOOGLE_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_GEOCODING_KEY || '';

/**
 * Reverse geocode using Google Geocoding API (more accurate neighborhoods)
 */
async function reverseGeocodeGoogle(lat: number, lng: number): Promise<string | null> {
  if (!GOOGLE_API_KEY) return null;

  try {
    const response = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${GOOGLE_API_KEY}`
    );

    if (!response.ok) return null;

    const data = await response.json();
    if (data.status !== 'OK' || !data.results?.length) return null;

    // Google returns multiple results - first is most specific
    const components = data.results[0]?.address_components || [];

    // Extract address parts by type
    const getComponent = (type: string): string => {
      const comp = components.find((c: { types: string[] }) => c.types.includes(type));
      return comp?.long_name || '';
    };

    const neighborhood = getComponent('neighborhood');
    const sublocality = getComponent('sublocality_level_1') || getComponent('sublocality');
    const locality = getComponent('locality');
    const adminArea = getComponent('administrative_area_level_1');
    const country = getComponent('country');

    // For NYC, sublocality is often the borough (Brooklyn, Manhattan)
    // and neighborhood is the specific area (Williamsburg, SoHo)
    const specificArea = neighborhood || '';
    const borough = sublocality || '';
    const city = locality || '';

    // Build location string
    if (specificArea && borough) {
      // "Williamsburg, Brooklyn" or "SoHo, Manhattan"
      return `${specificArea}, ${borough}`;
    } else if (specificArea && city) {
      return `${specificArea}, ${city}`;
    } else if (borough && city) {
      return `${borough}, ${city}`;
    } else if (city && adminArea) {
      return `${city}, ${adminArea}`;
    } else if (city && country) {
      return `${city}, ${country}`;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Reverse geocode using OpenStreetMap Nominatim (free fallback)
 */
async function reverseGeocodeNominatim(lat: number, lng: number): Promise<string> {
  const response = await fetch(
    `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1&zoom=18`,
    {
      headers: {
        'User-Agent': 'AI-Visibility-App/1.0',
      },
    }
  );

  if (!response.ok) {
    throw new Error('Failed to get location name');
  }

  const data = await response.json();
  const address = data.address || {};

  // Nominatim returns detailed address components
  const quarter = address.quarter || '';
  const neighbourhood = address.neighbourhood || '';
  const suburb = address.suburb || '';
  const cityDistrict = address.city_district || '';
  const city = address.city || address.town || address.village || '';
  const state = address.state || '';
  const country = address.country || '';
  const countryCode = address.country_code?.toUpperCase() || '';

  const neighborhood = quarter || neighbourhood || cityDistrict || '';
  const isNYC = suburb && city === 'New York';

  let locationString = '';

  if (isNYC) {
    if (neighborhood) {
      locationString = `${neighborhood}, ${suburb}`;
    } else {
      locationString = `${suburb}, ${city}`;
    }
  } else if (countryCode === 'US') {
    if (neighborhood && city) {
      locationString = `${neighborhood}, ${city}`;
    } else if (suburb && city) {
      locationString = `${suburb}, ${city}`;
    } else if (city && state) {
      locationString = `${city}, ${state}`;
    } else {
      locationString = city || suburb || state;
    }
  } else {
    if (neighborhood && city) {
      locationString = `${neighborhood}, ${city}`;
    } else if (suburb && city) {
      locationString = `${suburb}, ${city}`;
    } else if (city && country) {
      locationString = `${city}, ${country}`;
    } else {
      locationString = city || suburb || country;
    }
  }

  return locationString || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
}

export function useGeolocation() {
  const [state, setState] = useState<GeolocationState>({
    loading: false,
    error: null,
  });

  const detectLocation = useCallback(async (): Promise<LocationResult | null> => {
    setState({ loading: true, error: null });

    try {
      // Check if geolocation is supported
      if (!navigator.geolocation) {
        throw new Error('Geolocation is not supported by your browser');
      }

      // Get coordinates from browser
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          resolve,
          () => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: true,
              timeout: 30000,
              maximumAge: 300000,
            });
          },
          {
            enableHighAccuracy: false,
            timeout: 15000,
            maximumAge: 300000,
          }
        );
      });

      const { latitude: lat, longitude: lng } = position.coords;

      // Try Google first (more accurate), fall back to Nominatim
      let locationString = await reverseGeocodeGoogle(lat, lng);

      if (!locationString) {
        locationString = await reverseGeocodeNominatim(lat, lng);
      }

      setState({ loading: false, error: null });

      return {
        city: locationString,
        coords: { lat, lng },
      };
    } catch (err) {
      let errorMessage = 'Failed to detect location';

      if (err instanceof GeolocationPositionError) {
        switch (err.code) {
          case err.PERMISSION_DENIED:
            errorMessage = 'Location permission denied. Please enter your location manually.';
            break;
          case err.POSITION_UNAVAILABLE:
            errorMessage = 'Location unavailable. Please enter your location manually.';
            break;
          case err.TIMEOUT:
            errorMessage = 'Location request timed out. Please try again or enter manually.';
            break;
        }
      } else if (err instanceof Error) {
        errorMessage = err.message;
      }

      setState({ loading: false, error: errorMessage });
      return null;
    }
  }, []);

  return {
    detectLocation,
    loading: state.loading,
    error: state.error,
    clearError: () => setState((s) => ({ ...s, error: null })),
  };
}
