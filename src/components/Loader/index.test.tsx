import { render, screen } from '@testing-library/react';
import { ThemeProvider } from 'styled-components';
import { theme } from '../theme';
import { Loader } from './';

describe('Loader', () => {
  it('renders a loader', () => {
    render(
      <ThemeProvider theme={theme}>
        <Loader />
      </ThemeProvider>
    );
    // Use screen.getByTestId instead of direct node access
    expect(screen.getByTestId('loader')).toBeInTheDocument();
  });
});
