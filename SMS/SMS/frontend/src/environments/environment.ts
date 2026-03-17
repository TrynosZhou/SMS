export const environment = {
  production: false,
  // Use relative URL so ng serve proxies /api to backend (http://localhost:3001)
  apiUrl: '/api',
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

