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
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: false,
          timeout: 10000,
          maximumAge: 300000, // 5 minutes cache
        });
      });

      const { latitude: lat, longitude: lng } = position.coords;

      // Reverse geocode using BigDataCloud (free, no API key needed)
      const response = await fetch(
        `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`
      );

      if (!response.ok) {
        throw new Error('Failed to get location name');
      }

      const data = await response.json();

      // Build a readable location string
      // Prefer: city, state/region for US; city, country for international
      let city = data.city || data.locality || data.principalSubdivision || '';
      const region = data.principalSubdivision || '';
      const country = data.countryName || '';
      const countryCode = data.countryCode || '';

      let locationString = city;
      if (countryCode === 'US' && region && region !== city) {
        // For US, use "City, State" format
        locationString = `${city}, ${region}`;
      } else if (country && country !== city) {
        // For international, use "City, Country" if different
        locationString = city ? `${city}, ${country}` : country;
      }

      // Fallback if we couldn't get a good name
      if (!locationString) {
        locationString = `${lat.toFixed(2)}, ${lng.toFixed(2)}`;
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
