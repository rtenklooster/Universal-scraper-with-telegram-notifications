import React, { useEffect, useState } from 'react';
import {
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  IconButton,
  Chip,
  Box,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  FormControlLabel,
  Switch,
  Stack,
  useTheme,
  useMediaQuery,
  Tabs,
  Tab,
} from '@mui/material';
import { Edit as EditIcon, Delete as DeleteIcon } from '@mui/icons-material';
import axios from 'axios';

interface Query {
  id: number;
  retailerId: number;
  retailerName: string;
  searchText: string;
  intervalMinutes: number;
  isActive: boolean;
  notifyOnNew: boolean;
  notifyOnPriceDrops: boolean;
  priceDropThresholdPercent?: number;
  lastScrapedAt?: string;
  userId: number;
  username?: string; // Toegevoegd username veld
}

interface QueriesPageProps {
  selectedUserId: number | null;
}

const QueriesPage: React.FC<QueriesPageProps> = ({ selectedUserId }) => {
  const [queries, setQueries] = useState<Query[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [editQuery, setEditQuery] = useState<Query | null>(null);
  const [openDialog, setOpenDialog] = useState(false);
  const [selectedRetailer, setSelectedRetailer] = useState<string>('all');
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const fetchQueries = async () => {
    try {
      let url = '/api/queries';
      if (selectedUserId) {
        url += `?userId=${selectedUserId}`;
      }
      const response = await axios.get(url);
      setQueries(response.data);
    } catch (error) {
      console.error('Error fetching queries:', error);
    }
  };

  // Effect to refetch when selectedUserId changes
  React.useEffect(() => {
    fetchQueries();
  }, [selectedUserId]);

  const handleEdit = (query: Query) => {
    setEditQuery(query);
    setOpenDialog(true);
  };

  const handleDelete = async (id: number) => {
    if (window.confirm('Are you sure you want to delete this query?')) {
      try {
        await axios.delete(`/api/queries/${id}`);
        fetchQueries();
      } catch (error) {
        console.error('Error deleting query:', error);
      }
    }
  };

  const handleSave = async () => {
    if (!editQuery) return;
    try {
      await axios.put(`/api/queries/${editQuery.id}`, editQuery);
      fetchQueries();
      setOpenDialog(false);
    } catch (error) {
      console.error('Error updating query:', error);
    }
  };

  const retailers = Array.from(new Set(queries.map(q => q.retailerName)));
  
  const filteredQueries = queries.filter(query =>
    (selectedRetailer === 'all' || query.retailerName === selectedRetailer) &&
    (query.searchText.toLowerCase().includes(searchTerm.toLowerCase()) ||
    query.retailerName.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <Box>
      <Stack 
        direction={isMobile ? 'column' : 'row'} 
        spacing={2} 
        sx={{ mb: 3, alignItems: isMobile ? 'stretch' : 'center' }}
      >
        <Typography variant="h4" sx={{ flexGrow: 1, mb: isMobile ? 1 : 0 }}>
          Search Queries
        </Typography>
        <TextField
          label="Search queries..."
          variant="outlined"
          size="small"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          sx={{ minWidth: isMobile ? '100%' : '200px' }}
        />
      </Stack>

      <Paper sx={{ mb: 2 }}>
        <Tabs
          value={selectedRetailer}
          onChange={(_, value) => setSelectedRetailer(value)}
          variant="scrollable"
          scrollButtons="auto"
        >
          <Tab label="All Retailers" value="all" />
          {retailers.map(retailer => (
            <Tab key={retailer} label={retailer} value={retailer} />
          ))}
        </Tabs>
      </Paper>

      <TableContainer 
        component={Paper} 
        sx={{ 
          overflowX: 'auto',
          '& .MuiTableCell-root': {
            whiteSpace: 'nowrap',
            minWidth: isMobile ? '100px' : 'auto',
          },
          '& .MuiTableCell-sizeSmall': {
            padding: 1,
          }
        }}
      >
        <Table size={isMobile ? "small" : "medium"}>
          <TableHead>
            <TableRow>
              <TableCell>Retailer</TableCell>
              <TableCell>Search Query</TableCell>
              {!selectedUserId && <TableCell>User</TableCell>}
              <TableCell align="center">Interval</TableCell>
              <TableCell align="center">Status</TableCell>
              <TableCell>Notifications</TableCell>
              <TableCell>Last Checked</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredQueries.map((query) => (
              <TableRow key={query.id}>
                <TableCell>{query.retailerName}</TableCell>
                <TableCell>
                  <Typography 
                    sx={{ 
                      maxWidth: isMobile ? '150px' : '300px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }}
                  >
                    {query.searchText}
                  </Typography>
                </TableCell>
                {!selectedUserId && (
                  <TableCell>
                    {query.username || `User ${query.userId}`}
                  </TableCell>
                )}
                <TableCell align="center">{query.intervalMinutes}m</TableCell>
                <TableCell align="center">
                  <Chip 
                    label={query.isActive ? "Active" : "Inactive"}
                    color={query.isActive ? "success" : "default"}
                    size="small"
                  />
                </TableCell>
                <TableCell>
                  <Stack direction="row" spacing={0.5} flexWrap="wrap" sx={{ gap: 0.5 }}>
                    {query.notifyOnNew && (
                      <Chip label="New" size="small" />
                    )}
                    {query.notifyOnPriceDrops && (
                      <Chip 
                        label={query.priceDropThresholdPercent 
                          ? `${query.priceDropThresholdPercent}%` 
                          : "Drops"
                        }
                        size="small"
                      />
                    )}
                  </Stack>
                </TableCell>
                <TableCell>
                  {query.lastScrapedAt 
                    ? new Date(query.lastScrapedAt).toLocaleString()
                    : 'Never'
                  }
                </TableCell>
                <TableCell align="right" sx={{ minWidth: '80px' }}>
                  <IconButton onClick={() => handleEdit(query)} size="small" sx={{ mr: 1 }}>
                    <EditIcon fontSize="small" />
                  </IconButton>
                  <IconButton onClick={() => handleDelete(query.id)} size="small">
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog 
        open={openDialog} 
        onClose={() => setOpenDialog(false)}
        fullScreen={isMobile}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Edit Query</DialogTitle>
        <DialogContent>
          {editQuery && (
            <Box sx={{ pt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <TextField
                label="Search Query"
                fullWidth
                value={editQuery.searchText}
                onChange={(e) => setEditQuery({...editQuery, searchText: e.target.value})}
                multiline
                rows={2}
              />
              <TextField
                label="Interval (minutes)"
                type="number"
                fullWidth
                value={editQuery.intervalMinutes}
                onChange={(e) => setEditQuery({...editQuery, intervalMinutes: parseInt(e.target.value)})}
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={editQuery.isActive}
                    onChange={(e) => setEditQuery({...editQuery, isActive: e.target.checked})}
                  />
                }
                label="Active"
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={editQuery.notifyOnNew}
                    onChange={(e) => setEditQuery({...editQuery, notifyOnNew: e.target.checked})}
                  />
                }
                label="Notify on new items"
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={editQuery.notifyOnPriceDrops}
                    onChange={(e) => setEditQuery({...editQuery, notifyOnPriceDrops: e.target.checked})}
                  />
                }
                label="Notify on price drops"
              />
              {editQuery.notifyOnPriceDrops && (
                <TextField
                  label="Price Drop Threshold (%)"
                  type="number"
                  fullWidth
                  value={editQuery.priceDropThresholdPercent || ''}
                  onChange={(e) => setEditQuery({
                    ...editQuery, 
                    priceDropThresholdPercent: parseInt(e.target.value) || undefined
                  })}
                />
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setOpenDialog(false)}>Cancel</Button>
          <Button onClick={handleSave} variant="contained">Save</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default QueriesPage;