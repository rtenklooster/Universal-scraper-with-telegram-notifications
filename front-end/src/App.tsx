import React from 'react';
import { Route, Routes } from 'react-router-dom';
import { Box, Container, AppBar, Toolbar, Typography, Button } from '@mui/material';
import { Link } from 'react-router-dom';
import QueriesPage from './components/QueriesPage';
import ProductsPage from './components/ProductsPage';

function App() {
  return (
    <Box sx={{ flexGrow: 1 }}>
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
            MultiScraper
          </Typography>
          <Button color="inherit" component={Link} to="/">
            Queries
          </Button>
          <Button color="inherit" component={Link} to="/products">
            Products
          </Button>
        </Toolbar>
      </AppBar>
      <Container sx={{ mt: 3 }}>
        <Routes>
          <Route path="/" element={<QueriesPage />} />
          <Route path="/products" element={<ProductsPage />} />
        </Routes>
      </Container>
    </Box>
  );
}

export default App;
