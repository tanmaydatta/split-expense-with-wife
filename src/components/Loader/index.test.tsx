import { render } from '@testing-library/react';
import { ThemeProvider } from 'styled-components';
import { theme } from '../theme';
import { Loader } from './';

describe('Loader', () => {
  it('renders a loader', () => {
    const { container } = render(
      <ThemeProvider theme={theme}>
        <Loader />
      </ThemeProvider>
    );
    expect(container.firstChild).toBeInTheDocument();
  });
});
