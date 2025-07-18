import { render, screen } from '@testing-library/react';
import { ThemeProvider } from 'styled-components';
import { theme } from '../theme';
import { Card } from './';

describe('Card', () => {
  it('renders a card with the correct text', () => {
    render(
      <ThemeProvider theme={theme}>
        <Card>Card content</Card>
      </ThemeProvider>
    );
    expect(screen.getByText('Card content')).toBeInTheDocument();
  });
});
