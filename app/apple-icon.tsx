import { ImageResponse } from 'next/og';

export const size = {
  width: 180,
  height: 180,
};
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          fontSize: 120,
          background: '#4A7C59',
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'white',
          borderRadius: '32px',
          fontWeight: 'bold',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        V
      </div>
    ),
    {
      ...size,
    }
  );
}
