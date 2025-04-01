import React from 'react';
import { Route, Routes } from 'react-router-dom';
import { Box, Container, AppBar, Toolbar, Typography, Button } from '@mui/material';
import { Link } from 'react-router-dom';
import QueriesPage from './components/QueriesPage';
import ProductsPage from './components/ProductsPage';
import UsersPage from './components/UsersPage';
import NotificationsPage from './components/NotificationsPage';

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
          <Button color="inherit" component={Link} to="/notifications">
            Notifications
          </Button>
          <Button color="inherit" component={Link} to="/users">
            Users
          </Button>
        </Toolbar>
      </AppBar>
      <Container sx={{ mt: 3 }}>
        <Routes>
          <Route path="/" element={<QueriesPage />} />
          <Route path="/products" element={<ProductsPage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/users" element={<UsersPage />} />
        </Routes>
      </Container>
    </Box>
  );
}

export default App;
