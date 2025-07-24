const path = require('path');

module.exports = {
  webpack: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@shared-types': path.resolve(__dirname, 'shared-types')
    },
  }
}; 