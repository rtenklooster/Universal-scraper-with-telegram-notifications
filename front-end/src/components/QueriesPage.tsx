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
  Switch
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
}

const QueriesPage = () => {
  const [queries, setQueries] = useState<Query[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [editQuery, setEditQuery] = useState<Query | null>(null);
  const [openDialog, setOpenDialog] = useState(false);

  useEffect(() => {
    fetchQueries();
  }, []);

  const fetchQueries = async () => {
    try {
      const response = await axios.get('/api/queries');
      setQueries(response.data);
    } catch (error) {
      console.error('Error fetching queries:', error);
    }
  };

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

  const filteredQueries = queries.filter(query =>
    query.searchText.toLowerCase().includes(searchTerm.toLowerCase()) ||
    query.retailerName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <Box>
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h4">Search Queries</Typography>
        <TextField
          label="Search queries..."
          variant="outlined"
          size="small"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </Box>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Retailer</TableCell>
              <TableCell>Search Query</TableCell>
              <TableCell>Interval (min)</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Notifications</TableCell>
              <TableCell>Last Checked</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredQueries.map((query) => (
              <TableRow key={query.id}>
                <TableCell>{query.retailerName}</TableCell>
                <TableCell>{query.searchText}</TableCell>
                <TableCell>{query.intervalMinutes}</TableCell>
                <TableCell>
                  <Chip 
                    label={query.isActive ? "Active" : "Inactive"}
                    color={query.isActive ? "success" : "default"}
                  />
                </TableCell>
                <TableCell>
                  <Box>
                    {query.notifyOnNew && (
                      <Chip label="New Items" size="small" sx={{ mr: 0.5 }} />
                    )}
                    {query.notifyOnPriceDrops && (
                      <Chip 
                        label={query.priceDropThresholdPercent 
                          ? `Price Drops (${query.priceDropThresholdPercent}%)` 
                          : "Price Drops"
                        }
                        size="small"
                      />
                    )}
                  </Box>
                </TableCell>
                <TableCell>
                  {query.lastScrapedAt 
                    ? new Date(query.lastScrapedAt).toLocaleString()
                    : 'Never'
                  }
                </TableCell>
                <TableCell>
                  <IconButton onClick={() => handleEdit(query)} size="small">
                    <EditIcon />
                  </IconButton>
                  <IconButton onClick={() => handleDelete(query.id)} size="small">
                    <DeleteIcon />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={openDialog} onClose={() => setOpenDialog(false)}>
        <DialogTitle>Edit Query</DialogTitle>
        <DialogContent>
          {editQuery && (
            <Box sx={{ pt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <TextField
                label="Search Query"
                fullWidth
                value={editQuery.searchText}
                onChange={(e) => setEditQuery({...editQuery, searchText: e.target.value})}
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
        <DialogActions>
          <Button onClick={() => setOpenDialog(false)}>Cancel</Button>
          <Button onClick={handleSave} variant="contained">Save</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default QueriesPage;