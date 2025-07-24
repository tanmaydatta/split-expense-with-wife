/**
 * Scroll to top utility function
 * Finds the scrollable container and smoothly scrolls to the top
 */
export const scrollToTop = () => {
  // Find the scrollable container by traversing up the DOM
  const findScrollableParent = (element: Element | null): Element | null => {
    if (!element) return null;
    const style = window.getComputedStyle(element);
    if (style.overflow === 'auto' || style.overflowY === 'auto' || style.overflow === 'scroll' || style.overflowY === 'scroll') {
      return element;
    }
    return findScrollableParent(element.parentElement);
  };
  
  // Try to find a scrollable container by looking for common container elements
  const containerElement = 
    document.querySelector('[data-test-id="dashboard-container"]') ||
    document.querySelector('.settings-container') ||
    document.querySelector('main') ||
    document.querySelector('.app-container');
    
  const scrollableContainer = findScrollableParent(containerElement);
  
  if (scrollableContainer) {
    scrollableContainer.scrollTo({ top: 0, behavior: 'smooth' });
  } else {
    // Fallback to window scroll
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}; 