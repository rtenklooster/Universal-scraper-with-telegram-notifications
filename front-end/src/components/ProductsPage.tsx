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
  Tooltip,
  SelectChangeEvent,
  Tabs,
  Tab,
} from '@mui/material';
import {
  FilterList as FilterIcon,
  Sort as SortIcon,
  LocationOn as LocationIcon,
} from '@mui/icons-material';
import axios from 'axios';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { styled } from '@mui/material/styles';
import Collapse from '@mui/material/Collapse';
import { IconButtonProps } from '@mui/material/IconButton';

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

type TimeFilter = 'all' | '1h' | '6h' | '12h' | '24h';

interface ProductsPageProps {
  selectedUserId: number | null;
}

interface ExpandMoreProps extends IconButtonProps {
  expand: boolean;
}

const ExpandMore = styled((props: ExpandMoreProps) => {
  const { expand, ...other } = props;
  return <IconButton {...other} />;
})(({ theme, expand }) => ({
  transform: !expand ? 'rotate(0deg)' : 'rotate(180deg)',
  marginLeft: 'auto',
  transition: theme.transitions.create('transform', {
    duration: theme.transitions.duration.shortest,
  }),
}));

const ProductsPage: React.FC<ProductsPageProps> = ({ selectedUserId }) => {
  const [products, setProducts] = React.useState<Product[]>([]);
  const [searchTerm, setSearchTerm] = React.useState('');
  const [sortOrder, setSortOrder] = React.useState<'asc' | 'desc'>('desc');
  const [sortField, setSortField] = React.useState<'price' | 'discoveredAt' | 'discountPercentage' | 'discountAmount'>('discoveredAt');
  const [retailerFilter, setRetailerFilter] = React.useState<number | 'all'>('all');
  const [priceRange, setPriceRange] = React.useState<[number, number]>([0, 1000]);
  const [retailers, setRetailers] = React.useState<Retailer[]>([]);
  const [maxPrice, setMaxPrice] = React.useState(1000);
  const [timeFilter, setTimeFilter] = React.useState<TimeFilter>('1h');
  const [expandedCards, setExpandedCards] = React.useState<{[key: number]: boolean}>({});

  const handleExpandClick = (productId: number) => {
    setExpandedCards(prev => ({
      ...prev,
      [productId]: !prev[productId]
    }));
  };

  React.useEffect(() => {
    fetchProducts();
    fetchRetailers();
  }, []);

  const fetchProducts = async () => {
    try {
      let url = '/api/products';
      if (selectedUserId) {
        url += `?userId=${selectedUserId}`;
      }
      const response = await axios.get(url);
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

  const isWithinTimeRange = (date: string, hours: number | null) => {
    if (hours === null) return true;
    const productDate = new Date(date);
    const now = new Date();
    const diffHours = (now.getTime() - productDate.getTime()) / (1000 * 60 * 60);
    return diffHours <= hours;
  };

  const getTimeFilterHours = (filter: TimeFilter): number | null => {
    switch (filter) {
      case '1h': return 1;
      case '6h': return 6;
      case '12h': return 12;
      case '24h': return 24;
      default: return null;
    }
  };

  const filteredProducts = products
    .filter((product: Product) =>
      (searchTerm === '' ||
        product.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.description.toLowerCase().includes(searchTerm.toLowerCase())) &&
      (retailerFilter === 'all' || product.retailerId === retailerFilter) &&
      product.price >= priceRange[0] &&
      product.price <= priceRange[1] &&
      isWithinTimeRange(product.discoveredAt, getTimeFilterHours(timeFilter))
    );

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

  const handleTimeFilterChange = (_event: React.SyntheticEvent, newValue: TimeFilter) => {
    setTimeFilter(newValue);
  };

  const calculateDiscountPercentage = (price: number, oldPrice?: number) => {
    if (!oldPrice || oldPrice <= price) return null;
    return Math.round(((oldPrice - price) / oldPrice) * 100);
  };

  const calculateDiscountAmount = (price: number, oldPrice?: number) => {
    if (!oldPrice || oldPrice <= price) return null;
    return oldPrice - price;
  };

  const formatDistance = (meters?: number) => {
    if (!meters) return null;
    return meters >= 1000 
      ? `${(meters / 1000).toFixed(1)} km`
      : `${meters} m`;
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
          <Grid item xs={12}>
            <Tabs
              value={timeFilter}
              onChange={handleTimeFilterChange}
              indicatorColor="primary"
              textColor="primary"
              variant="fullWidth"
            >
              <Tab label="Alle producten" value="all" />
              <Tab label="Laatste uur" value="1h" />
              <Tab label="Laatste 6 uur" value="6h" />
              <Tab label="Laatste 12 uur" value="12h" />
              <Tab label="Laatste 24 uur" value="24h" />
            </Tabs>
          </Grid>
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
              }}
            >
              <Box sx={{ p: 2 }}>
                <Typography
                  variant="h6"
                  component="a"
                  href={product.productUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  sx={{
                    textDecoration: 'none',
                    color: 'inherit',
                    display: '-webkit-box',
                    WebkitBoxOrient: 'vertical',
                    WebkitLineClamp: 2,
                    overflow: 'hidden',
                    minHeight: '3.6em'
                  }}
                >
                  {product.title}
                </Typography>
              </Box>

              <Box sx={{ position: 'relative' }}>
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
              </Box>

              <CardContent sx={{ flexGrow: 1, pt: 1 }}>
                <Stack spacing={1}>
                  <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Box>
                      {product.oldPrice && product.oldPrice > product.price && (
                        <Typography
                          variant="body2"
                          color="text.secondary"
                          sx={{ textDecoration: 'line-through' }}
                        >
                          {product.oldPrice} {product.currency}
                        </Typography>
                      )}
                      <Typography variant="h6" color="primary">
                        {product.price} {product.currency}
                      </Typography>
                    </Box>
                    {product.location && (
                      <Tooltip title={formatDistance(product.distanceMeters) || ''}>
                        <Chip size="small" icon={<LocationIcon />} label={product.location} />
                      </Tooltip>
                    )}
                  </Stack>

                  <Box>
                    <Typography variant="caption" color="text.secondary" display="block">
                      {new Date(product.discoveredAt).toLocaleString()}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" display="block">
                      {product.retailerName}
                    </Typography>
                  </Box>

                  {product.description && (
                    <>
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{
                          display: '-webkit-box',
                          WebkitBoxOrient: 'vertical',
                          WebkitLineClamp: 2,
                          overflow: 'hidden',
                          visibility: expandedCards[product.id] ? 'hidden' : 'visible',
                          height: expandedCards[product.id] ? 0 : 'auto',
                        }}
                      >
                        {product.description}
                      </Typography>
                      <ExpandMore
                        expand={expandedCards[product.id] || false}
                        onClick={() => handleExpandClick(product.id)}
                        aria-expanded={expandedCards[product.id] || false}
                        aria-label="show more"
                      >
                        <ExpandMoreIcon />
                      </ExpandMore>
                      <Collapse in={expandedCards[product.id]} timeout="auto" unmountOnExit>
                        <Typography paragraph>{product.description}</Typography>
                      </Collapse>
                    </>
                  )}
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
};

export default ProductsPage;