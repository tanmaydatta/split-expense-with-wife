import 'styled-components';

declare module 'styled-components' {
  export interface DefaultTheme {
    colors: {
      primary: string;
      secondary: string;
      success: string;
      danger: string;
      warning: string;
      info: string;
      light: string;
      dark: string;
      white: string;
      black: string;
    };
    fonts: {
      main: string;
    };
    fontSizes: {
      small: string;
      medium: string;
      large: string;
      xlarge: string;
    };
    spacing: {
      small: string;
      medium: string;
      large: string;
      xlarge: string;
    };
    borderRadius: string;
    shadows: {
      small: string;
      medium: string;
      large: string;
    };
  }
} 