import React, { useEffect } from 'react';
import { logout } from '@/utils/auth';
import { typedApi } from '@/utils/api';

const Logout: React.FC = () => {
  useEffect(() => {
    const performLogout = async () => {
      try {
        // Call logout API endpoint
        await typedApi.post('/logout', {});
      } catch (error) {
        console.error('Logout API call failed:', error);
        // Note: Even if the API call fails, we still want to clear local data
      } finally {
        // Use centralized logout function to clear all data and redirect
        logout();
      }
    };

    performLogout();
  }, []);

  return <div>Logging out...</div>;
};

export default Logout;
