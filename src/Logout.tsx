import React, { useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { unsetData } from './redux/data';
import { typedApi } from './utils/api';

const Logout: React.FC = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();

  useEffect(() => {
    const performLogout = async () => {
      try {
        await typedApi.post('/logout', {});
      } catch (error) {
        console.error('Logout failed:', error);
      } finally {
        // Clear session token and Redux store
        localStorage.removeItem('sessionToken');
        dispatch(unsetData());
        // Redirect to login page
        navigate('/login');
      }
    };

    performLogout();
  }, [dispatch, navigate]);

  return <div>Logging out...</div>;
};

export default Logout;
