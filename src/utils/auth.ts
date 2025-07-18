import { store } from '@/redux/store';
import { unsetData } from '@/redux/data';

/**
 * Centralized logout function that clears all user data and redirects to login
 */
export const logout = (): void => {
  // Clear localStorage
  localStorage.removeItem('sessionToken');
  localStorage.removeItem('persist:root'); // Clear persisted Redux state
  
  // Clear Redux store
  store.dispatch(unsetData());
  
  // Redirect to login page
  window.location.href = '/login';
};

/**
 * Check if user is authenticated
 */
export const isAuthenticated = (): boolean => {
  const token = localStorage.getItem('sessionToken');
  const state = store.getState();
  
  // Handle both persisted and non-persisted state structures
  const userData = state.value || state;
  
  return !!(token && userData && Object.keys(userData).length > 0);
}; 