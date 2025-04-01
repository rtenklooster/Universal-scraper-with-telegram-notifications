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
  Box,
  Typography,
  Chip,
  Link
} from '@mui/material';
import axios from 'axios';

interface Notification {
  id: number;
  notificationType: 'NEW_PRODUCT' | 'PRICE_DROP';
  createdAt: string;
  isRead: boolean;
  productTitle: string;
  productPrice: number;
  productOldPrice?: number;
  productCurrency: string;
  productUrl: string;
  imageUrl?: string;
  location?: string;
  distanceMeters?: number;
  retailerName: string;
  userName?: string;
  queryText: string;
}

const NotificationsPage = () => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchNotifications();
  }, []);

  const fetchNotifications = async () => {
    try {
      const response = await axios.get('/api/notifications');
      setNotifications(response.data);
    } catch (error) {
      console.error('Error fetching notifications:', error);
    }
  };

  const calculatePriceDropPercentage = (oldPrice: number, newPrice: number): number => {
    if (oldPrice <= 0 || newPrice <= 0) return 0;
    const percentageDrop = ((oldPrice - newPrice) / oldPrice) * 100;
    return Math.round(percentageDrop);
  };

  const filteredNotifications = notifications.filter(notification =>
    notification.productTitle.toLowerCase().includes(searchTerm.toLowerCase()) ||
    notification.retailerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (notification.userName?.toLowerCase() || '').includes(searchTerm.toLowerCase())
  );

  return (
    <Box>
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h4">Notifications</Typography>
        <TextField
          label="Search notifications..."
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
              <TableCell>Type</TableCell>
              <TableCell>Product</TableCell>
              <TableCell>Price</TableCell>
              <TableCell>Retailer</TableCell>
              <TableCell>User</TableCell>
              <TableCell>Query</TableCell>
              <TableCell>Date</TableCell>
              <TableCell>Status</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredNotifications.map((notification) => (
              <TableRow key={notification.id}>
                <TableCell>
                  <Chip 
                    label={notification.notificationType === 'NEW_PRODUCT' ? 'New' : 'Price Drop'}
                    color={notification.notificationType === 'NEW_PRODUCT' ? 'success' : 'warning'}
                    size="small"
                  />
                </TableCell>
                <TableCell>
                  <Link href={notification.productUrl} target="_blank" rel="noopener noreferrer">
                    {notification.productTitle}
                  </Link>
                  {notification.location && (
                    <Typography variant="caption" display="block" color="textSecondary">
                      📍 {notification.location}
                      {notification.distanceMeters && ` (${Math.round(notification.distanceMeters / 100) / 10} km)`}
                    </Typography>
                  )}
                </TableCell>
                <TableCell>
                  {notification.notificationType === 'PRICE_DROP' && notification.productOldPrice && (
                    <>
                      <Typography variant="body2" color="textSecondary" style={{ textDecoration: 'line-through' }}>
                        {notification.productOldPrice} {notification.productCurrency}
                      </Typography>
                      <Typography variant="caption" color="error">
                        -{calculatePriceDropPercentage(notification.productOldPrice, notification.productPrice)}%
                      </Typography>
                    </>
                  )}
                  <Typography variant="body2">
                    {notification.productPrice} {notification.productCurrency}
                  </Typography>
                </TableCell>
                <TableCell>{notification.retailerName}</TableCell>
                <TableCell>{notification.userName || '-'}</TableCell>
                <TableCell>{notification.queryText}</TableCell>
                <TableCell>{new Date(notification.createdAt).toLocaleString()}</TableCell>
                <TableCell>
                  <Chip 
                    label={notification.isRead ? "Read" : "Unread"}
                    color={notification.isRead ? "default" : "info"}
                    size="small"
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
};

export default NotificationsPage;