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

      // Reverse geocode using BigDataCloud (free, no API key needed)
      const response = await fetch(
        `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`
      );

      if (!response.ok) {
        throw new Error('Failed to get location name');
      }

      const data = await response.json();

      // Build a readable location string with neighborhood precision
      // BigDataCloud returns: neighbourhood, locality, city, principalSubdivision (state), countryName
      const neighbourhood = data.neighbourhood || '';
      const locality = data.locality || '';
      const city = data.city || '';
      const region = data.principalSubdivision || '';
      const country = data.countryName || '';
      const countryCode = data.countryCode || '';

      // For US locations, prefer: "Neighborhood, City" or "City, State"
      // For international: "Neighborhood, City" or "City, Country"
      let locationString = '';

      if (countryCode === 'US') {
        // US: Try "Neighborhood, City" first, then "City, State"
        if (neighbourhood && city) {
          locationString = `${neighbourhood}, ${city}`;
        } else if (locality && city && locality !== city) {
          locationString = `${locality}, ${city}`;
        } else if (city && region) {
          locationString = `${city}, ${region}`;
        } else if (locality && region) {
          locationString = `${locality}, ${region}`;
        } else {
          locationString = city || locality || region;
        }
      } else {
        // International: Try "Neighborhood, City" or "City, Country"
        if (neighbourhood && city) {
          locationString = `${neighbourhood}, ${city}`;
        } else if (locality && city && locality !== city) {
          locationString = `${locality}, ${city}`;
        } else if (city && country) {
          locationString = `${city}, ${country}`;
        } else {
          locationString = city || locality || country;
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
