// This file can be replaced during build by using the `fileReplacements` array.
// For production, we'll use the API_URL from environment variables
// Vercel will inject this during build time

declare const process: {
  env: {
    [key: string]: string;
  };
};

export const environment = {
  production: true,
  apiUrl: process.env['API_URL'] || 'https://your-backend-url.onrender.com/api'
};

