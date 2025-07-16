import { render, screen } from '@testing-library/react';
import { ThemeProvider } from 'styled-components';
import { theme } from '../../theme';
import { Input } from './';

describe('Input', () => {
  it('renders an input with the correct placeholder', () => {
    render(
      <ThemeProvider theme={theme}>
        <Input placeholder="Enter text" />
      </ThemeProvider>
    );
    expect(screen.getByPlaceholderText('Enter text')).toBeInTheDocument();
  });
});
