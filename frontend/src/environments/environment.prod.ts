// This file can be replaced during build by using the `fileReplacements` array.
// For production, use the actual backend API URL
export const environment = {
  production: true,
  apiUrl: 'https://sms-2-xig2.onrender.com/api',
  messages: {
    staffInboxCandidates: [
      '/messages/staff?box=accountant',
      '/messages/accountant/inbox',
      '/messages/inbox?role=accountant',
      '/accountant/messages',
      '/accountant/inbox',
      '/messages/staff/accountant'
    ]
  }
};

