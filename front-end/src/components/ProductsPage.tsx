import * as React from 'react';
import {
  Box,
  Grid,
  Card,
  CardContent,
  CardMedia,
  Typography,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Chip,
  Stack,
  InputAdornment,
  Slider,
  Paper,
  IconButton,
  Badge,
  Tooltip,
  SelectChangeEvent,
} from '@mui/material';
import {
  FilterList as FilterIcon,
  Sort as SortIcon,
  LocationOn as LocationIcon,
  Euro as EuroIcon,
} from '@mui/icons-material';
import axios from 'axios';

interface Product {
  id: number;
  title: string;
  description: string;
  price: number;
  oldPrice?: number;
  currency: string;
  imageUrl?: string;
  productUrl: string;
  location?: string;
  distanceMeters?: number;
  retailerId: number;
  retailerName: string;
  isAvailable: boolean;
  discoveredAt: string;
  priceType?: string;
}

interface Retailer {
  id: number;
  name: string;
}

const ProductsPage = () => {
  const [products, setProducts] = React.useState<Product[]>([]);
  const [searchTerm, setSearchTerm] = React.useState('');
  const [sortOrder, setSortOrder] = React.useState<'asc' | 'desc'>('asc');
  const [sortField, setSortField] = React.useState<'price' | 'discoveredAt' | 'discountPercentage' | 'discountAmount'>('discoveredAt');
  const [retailerFilter, setRetailerFilter] = React.useState<number | 'all'>('all');
  const [priceRange, setPriceRange] = React.useState<[number, number]>([0, 1000]);
  const [retailers, setRetailers] = React.useState<Retailer[]>([]);
  const [maxPrice, setMaxPrice] = React.useState(1000);

  React.useEffect(() => {
    fetchProducts();
    fetchRetailers();
  }, []);

  const fetchProducts = async () => {
    try {
      const response = await axios.get('/api/products');
      setProducts(response.data);
      const maxProductPrice = Math.max(...response.data.map((p: Product) => p.price));
      setMaxPrice(maxProductPrice);
      setPriceRange([0, maxProductPrice]);
    } catch (error) {
      console.error('Error fetching products:', error);
    }
  };

  const fetchRetailers = async () => {
    try {
      const response = await axios.get('/api/retailers');
      setRetailers(response.data);
    } catch (error) {
      console.error('Error fetching retailers:', error);
    }
  };

  const filteredProducts = products
    .filter((product: Product) =>
      (searchTerm === '' ||
        product.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.description.toLowerCase().includes(searchTerm.toLowerCase())) &&
      (retailerFilter === 'all' || product.retailerId === retailerFilter) &&
      product.price >= priceRange[0] &&
      product.price <= priceRange[1]
    )
    .sort((a: Product, b: Product) => {
      const compareValue = sortOrder === 'asc' ? 1 : -1;
      if (sortField === 'price') {
        return (a.price - b.price) * compareValue;
      }
      return (new Date(a.discoveredAt).getTime() - new Date(b.discoveredAt).getTime()) * compareValue;
    });

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
  };

  const handleRetailerChange = (e: SelectChangeEvent<number | 'all'>) => {
    setRetailerFilter(e.target.value as number | 'all');
  };

  const handleSortFieldChange = (e: SelectChangeEvent<'price' | 'discoveredAt' | 'discountPercentage' | 'discountAmount'>) => {
    setSortField(e.target.value as 'price' | 'discoveredAt' | 'discountPercentage' | 'discountAmount');
  };

  const handlePriceChange = (_event: Event, newValue: number | number[]) => {
    setPriceRange(newValue as [number, number]);
  };

  const calculateDiscountPercentage = (price: number, oldPrice?: number) => {
    if (!oldPrice || oldPrice <= price) return null;
    return Math.round(((oldPrice - price) / oldPrice) * 100);
  };

  const formatDistance = (meters?: number) => {
    if (!meters) return null;
    return meters >= 1000 
      ? `${(meters / 1000).toFixed(1)} km`
      : `${meters} m`;
  };

  const calculateDiscountAmount = (price: number, oldPrice?: number) => {
    if (!oldPrice || oldPrice <= price) return null;
    return oldPrice - price;
  };

  const enhancedFilteredProducts = filteredProducts.sort((a: Product, b: Product) => {
    const compareValue = sortOrder === 'asc' ? 1 : -1;
    if (sortField === 'price') {
      return (a.price - b.price) * compareValue;
    } else if (sortField === 'discountPercentage') {
      const discountA = calculateDiscountPercentage(a.price, a.oldPrice) || 0;
      const discountB = calculateDiscountPercentage(b.price, b.oldPrice) || 0;
      return (discountA - discountB) * compareValue;
    } else if (sortField === 'discountAmount') {
      const discountA = calculateDiscountAmount(a.price, a.oldPrice) || 0;
      const discountB = calculateDiscountAmount(b.price, b.oldPrice) || 0;
      return (discountA - discountB) * compareValue;
    }
    return (new Date(a.discoveredAt).getTime() - new Date(b.discoveredAt).getTime()) * compareValue;
  });

  return (
    <Box>
      <Paper sx={{ p: 2, mb: 2 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} md={4}>
            <TextField
              fullWidth
              label="Search products..."
              value={searchTerm}
              onChange={handleSearchChange}
              variant="outlined"
            />
          </Grid>
          <Grid item xs={12} md={3}>
            <FormControl fullWidth>
              <InputLabel>Retailer</InputLabel>
              <Select
                value={retailerFilter}
                label="Retailer"
                onChange={handleRetailerChange}
              >
                <MenuItem value="all">All Retailers</MenuItem>
                {retailers.map(retailer => (
                  <MenuItem key={retailer.id} value={retailer.id}>
                    {retailer.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} md={3}>
            <FormControl fullWidth>
              <InputLabel>Sort By</InputLabel>
              <Select
                value={sortField}
                label="Sort By"
                onChange={handleSortFieldChange}
                startAdornment={
                  <InputAdornment position="start">
                    <SortIcon />
                  </InputAdornment>
                }
              >
                <MenuItem value="price">Price</MenuItem>
                <MenuItem value="discoveredAt">Date Added</MenuItem>
                <MenuItem value="discountPercentage">Largest Discount (%)</MenuItem>
                <MenuItem value="discountAmount">Largest Discount (€)</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} md={2}>
            <IconButton onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}>
              <FilterIcon sx={{ transform: sortOrder === 'desc' ? 'scaleY(-1)' : 'none' }} />
            </IconButton>
          </Grid>
          <Grid item xs={12}>
            <Typography gutterBottom>Price Range</Typography>
            <Slider
              value={priceRange}
              onChange={handlePriceChange}
              valueLabelDisplay="auto"
              min={0}
              max={maxPrice}
              valueLabelFormat={(value: number) => `€${value}`}
            />
          </Grid>
        </Grid>
      </Paper>

      <Grid container spacing={2}>
        {enhancedFilteredProducts.map((product) => (
          <Grid item xs={12} sm={6} md={4} lg={3} key={product.id}>
            <Card
              sx={{
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                position: 'relative',
                width: '100%',
              }}
            >
              {product.oldPrice && product.oldPrice > product.price && (
                <Chip
                  label={`-${calculateDiscountPercentage(product.price, product.oldPrice)}%`}
                  color="error"
                  sx={{
                    position: 'absolute',
                    top: 10,
                    right: 10,
                    zIndex: 1,
                  }}
                />
              )}
              <CardMedia
                component="img"
                height="200"
                image={product.imageUrl || 'placeholder.png'}
                alt={product.title}
                sx={{ objectFit: 'contain', p: 1 }}
              />
              <CardContent sx={{ flexGrow: 1 }}>
                <Typography
                  variant="h6"
                  component="a"
                  href={product.productUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  noWrap
                  sx={{ textDecoration: 'none', color: 'inherit', display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2, overflow: 'hidden' }}
                >
                  {product.title}
                </Typography>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ mt: 1, display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2, overflow: 'hidden' }}
                >
                  {product.description}
                </Typography>
                {product.location && (
                  <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                    <Tooltip title={formatDistance(product.distanceMeters) || ''}>
                      <Chip size="small" icon={<LocationIcon />} label={product.location} />
                    </Tooltip>
                  </Stack>
                )}
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  {new Date(product.discoveredAt).toLocaleString()}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
};

export default ProductsPage;