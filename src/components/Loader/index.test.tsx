import { render } from '@testing-library/react';
import { ThemeProvider } from 'styled-components';
import { theme } from '../theme';
import { Loader } from './';

describe('Loader', () => {
  it('renders without crashing', () => {
    expect(() => {
      render(
        <ThemeProvider theme={theme}>
          <Loader />
        </ThemeProvider>
      );
    }).not.toThrow();
  });

  it('accepts data-test-id prop without crashing', () => {
    expect(() => {
      render(
        <ThemeProvider theme={theme}>
          <Loader data-test-id="custom-loader" />
        </ThemeProvider>
      );
    }).not.toThrow();
  });
});
