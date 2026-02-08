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
      // Try with low accuracy first (faster), fall back to high accuracy if needed
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        // First attempt with low accuracy (uses network/wifi, faster)
        navigator.geolocation.getCurrentPosition(
          resolve,
          () => {
            // If low accuracy fails, try high accuracy (GPS)
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: true,
              timeout: 30000,
              maximumAge: 300000, // 5 minutes cache
            });
          },
          {
            enableHighAccuracy: false,
            timeout: 15000,
            maximumAge: 300000, // 5 minutes cache
          }
        );
      });

      const { latitude: lat, longitude: lng } = position.coords;

      // Reverse geocode using OpenStreetMap Nominatim (free, detailed neighborhood data)
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

      // Nominatim returns detailed address components:
      // neighbourhood, suburb, city_district, city/town/village, state, country
      const neighbourhood = address.neighbourhood || '';
      const suburb = address.suburb || '';
      const cityDistrict = address.city_district || '';
      const city = address.city || address.town || address.village || '';
      const borough = address.borough || ''; // For NYC boroughs like Brooklyn
      const state = address.state || '';
      const country = address.country || '';
      const countryCode = address.country_code?.toUpperCase() || '';

      // Build location string with best available precision
      // Priority: neighbourhood > suburb > city_district > borough > city
      let locationString = '';

      // Get the most specific area name
      const specificArea = neighbourhood || suburb || cityDistrict || '';

      // For NYC and similar cities with boroughs
      if (borough && city) {
        if (specificArea) {
          // "Williamsburg, Brooklyn" or "Park Slope, Brooklyn"
          locationString = `${specificArea}, ${borough}`;
        } else {
          // "Brooklyn, New York"
          locationString = `${borough}, ${city}`;
        }
      } else if (countryCode === 'US') {
        // US: Try "Neighborhood, City" or "City, State"
        if (specificArea && city) {
          locationString = `${specificArea}, ${city}`;
        } else if (city && state) {
          locationString = `${city}, ${state}`;
        } else {
          locationString = city || state;
        }
      } else {
        // International: "Neighborhood, City" or "City, Country"
        if (specificArea && city) {
          locationString = `${specificArea}, ${city}`;
        } else if (city && country) {
          locationString = `${city}, ${country}`;
        } else {
          locationString = city || country;
        }
      }

      // Fallback if we couldn't get a good name
      if (!locationString) {
        locationString = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
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
