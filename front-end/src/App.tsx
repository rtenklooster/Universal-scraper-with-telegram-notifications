import React from 'react';
import { Route, Routes, useNavigate } from 'react-router-dom';
import { 
  Box, 
  Container, 
  AppBar, 
  Toolbar, 
  Typography, 
  Button, 
  Select, 
  MenuItem, 
  FormControl, 
  InputLabel, 
  SelectChangeEvent,
  IconButton,
  Drawer,
  List,
  ListItem,
  ListItemText,
  useTheme,
  useMediaQuery
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import { Link } from 'react-router-dom';
import QueriesPage from './components/QueriesPage';
import ProductsPage from './components/ProductsPage';
import UsersPage from './components/UsersPage';
import NotificationsPage from './components/NotificationsPage';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { useState } from 'react';

interface User {
  id: number;
  username: string;
  isAdmin: boolean;
}

function UserSelector({ onUserChange }: { onUserChange: (userId: number | null) => void }) {
  const { user } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<string>('');

  React.useEffect(() => {
    if (user?.isAdmin) {
      // Fetch users if admin
      fetch('/api/users')
        .then(res => res.json())
        .then(data => setUsers(data));
    }
  }, [user]);

  const handleChange = (event: SelectChangeEvent<string>) => {
    const value = event.target.value;
    setSelectedUser(value);
    onUserChange(value === '' ? null : parseInt(value, 10));
  };

  if (!user?.isAdmin) return null;

  return (
    <FormControl sx={{ minWidth: 200, ml: 2 }}>
      <InputLabel>View as User</InputLabel>
      <Select
        value={selectedUser}
        label="View as User"
        onChange={handleChange}
      >
        <MenuItem value="">
          <em>All Users</em>
        </MenuItem>
        {users.map(user => (
          <MenuItem key={user.id} value={user.id.toString()}>
            {user.username || `User ${user.id}`}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}

function AppContent() {
  const { user, loading, error } = useAuth();
  const navigate = useNavigate();
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  if (loading) {
    return <Box sx={{ p: 3 }}>Loading...</Box>;
  }

  if (error || !user) {
    return <Box sx={{ p: 3 }}>Authentication error: {error}</Box>;
  }

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  const menuItems = [
    { text: 'Queries', path: '/' },
    { text: 'Products', path: '/products' },
    { text: 'Notifications', path: '/notifications' },
    ...(user.isAdmin ? [{ text: 'Users', path: '/users' }] : []),
  ];

  const drawer = (
    <List>
      {menuItems.map((item) => (
        <ListItem 
          button 
          key={item.text} 
          component={Link} 
          to={item.path}
          onClick={handleDrawerToggle}
        >
          <ListItemText primary={item.text} />
        </ListItem>
      ))}
    </List>
  );

  return (
    <Box sx={{ flexGrow: 1 }}>
      <AppBar position="static">
        <Toolbar>
          {isMobile && (
            <IconButton
              color="inherit"
              aria-label="open drawer"
              edge="start"
              onClick={handleDrawerToggle}
              sx={{ mr: 2 }}
            >
              <MenuIcon />
            </IconButton>
          )}
          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
            MultiScraper
          </Typography>
          
          {!isMobile && (
            <>
              <Button color="inherit" component={Link} to="/">
                Queries
              </Button>
              <Button color="inherit" component={Link} to="/products">
                Products
              </Button>
              <Button color="inherit" component={Link} to="/notifications">
                Notifications
              </Button>
              {user.isAdmin && (
                <Button color="inherit" component={Link} to="/users">
                  Users
                </Button>
              )}
            </>
          )}
          <UserSelector onUserChange={setSelectedUserId} />
        </Toolbar>
      </AppBar>

      {isMobile && (
        <Drawer
          variant="temporary"
          anchor="left"
          open={mobileOpen}
          onClose={handleDrawerToggle}
          ModalProps={{
            keepMounted: true, // Better mobile performance
          }}
        >
          {drawer}
        </Drawer>
      )}

      <Container sx={{ mt: 3 }}>
        <Routes>
          <Route path="/" element={<QueriesPage selectedUserId={selectedUserId} />} />
          <Route path="/products" element={<ProductsPage selectedUserId={selectedUserId} />} />
          <Route path="/notifications" element={<NotificationsPage selectedUserId={selectedUserId} />} />
          {user.isAdmin && <Route path="/users" element={<UsersPage />} />}
        </Routes>
      </Container>
    </Box>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
