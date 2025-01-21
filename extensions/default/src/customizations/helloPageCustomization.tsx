import React from 'react';

export default {
  customRoutes: {
    routes: {
      $push: [
        {
          path: '/custom',
          children: () => <h1 style={{ color: 'white' }}>Hello Custom Route</h1>,
        },
      ],
    },
  },
};
