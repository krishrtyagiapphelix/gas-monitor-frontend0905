// alarmNotification.js - Enhanced to process individual alarms via WebSocket
import React, { useState, useEffect, useRef } from 'react';
import { 
  IconButton, 
  Badge, 
  Menu, 
  Typography, 
  List, 
  ListItem, 
  ListItemText, 
  Box, 
  Button,
  Divider,
  Paper,
  Popover,
  Alert
} from '@mui/material';
import NotificationsIcon from '@mui/icons-material/Notifications';
import WarningIcon from '@mui/icons-material/Warning';
import { useNavigate } from 'react-router-dom';
import { markAllAlarmsAsRead, markAlarmAsRead } from '../../services/alarmService';
import socketService from '../../services/socketService';
import axios from 'axios';

const AlarmNotification = () => {
  const navigate = useNavigate();
  
  // State for alarms and notification management
  const [recentAlarms, setRecentAlarms] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [anchorEl, setAnchorEl] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showBrowserNotification, setShowBrowserNotification] = useState(false);
  
  // Refs for tracking
  const alarmsRef = useRef([]);
  const initialLoadDoneRef = useRef(false);
  
  // Handle menu open/close
  const handleOpen = (event) => {
    setAnchorEl(event.currentTarget);
  };
  
  const handleClose = () => {
    setAnchorEl(null);
  };
  
  // Navigate to telemetry dashboard with alarms tab active
  const handleViewAll = () => {
    navigate('/telemetry-dashboard?tab=alarms');
    handleClose();
  };
  
  // Format timestamp for better display
  const formatTimestamp = (timestamp) => {
    if (!timestamp) return "";
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };
  
  // Handle marking a single alarm as read
  const handleMarkAsRead = async (alarmId) => {
    try {
      await markAlarmAsRead(alarmId);
      
      // Update local state to mark the alarm as read
      setRecentAlarms(prev => prev.map(alarm => 
        alarm._id === alarmId ? { ...alarm, IsRead: true } : alarm
      ));
      
      // Update unread count
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Error marking alarm as read:', error);
    }
  };
  
  // Handle marking all alarms as read
  const handleMarkAllRead = async () => {
    try {
      await markAllAlarmsAsRead();
      
      // Update local state
      setRecentAlarms(prev => prev.map(alarm => ({ ...alarm, IsRead: true })));
      setUnreadCount(0);
    } catch (error) {
      console.error('Error marking all alarms as read:', error);
    }
  };
  
  // Process a single alarm from WebSocket
  const processAlarm = (alarmData) => {
    if (!alarmData) return;
    
    // Generate a unique ID if one doesn't exist
    const uniqueId = `alarm-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    
    // Get timestamp for the new alarm
    const newTimestamp = new Date(alarmData.timestamp || alarmData.createdTimestamp || 
                                alarmData.CreatedTimestamp || new Date()).getTime();
    
    // Get alarm code and device name for comparison
    const newAlarmCode = alarmData.alarmCode || alarmData.AlarmCode || '';
    const newDeviceName = alarmData.deviceName || alarmData.DeviceName || '';
    
    // More aggressive duplicate detection using code, device and a longer time window
    const isDuplicate = alarmsRef.current.some(alarm => {
      // If any of these don't match, it's definitely not a duplicate
      if (alarm.AlarmCode !== newAlarmCode || alarm.DeviceName !== newDeviceName) {
        return false;
      }
      
      // Get timestamp for the existing alarm
      const existingTimestamp = new Date(alarm.CreatedTimestamp).getTime();
      
      // Increase window to 5 seconds to be more aggressive with batching prevention
      return Math.abs(existingTimestamp - newTimestamp) < 5000;
    });
    
    // Skip if it's a duplicate
    if (isDuplicate) {
      console.log('🔄 Skipping duplicate alarm:', newAlarmCode, 'for device', newDeviceName);
      return;
    }
    
    // Set isLoading to false to ensure we always show alarm details, not loading indicator
    setIsLoading(false);
    
    // Format the alarm data consistently with all required fields
    const formattedAlarm = {
      _id: alarmData.id || alarmData._id || uniqueId,
      AlarmId: alarmData.id || alarmData.alarmId || alarmData.AlarmId || uniqueId,
      AlarmCode: alarmData.alarmCode || alarmData.AlarmCode || 'ALARM',
      AlarmDescription: alarmData.description || alarmData.alarmDescription || alarmData.AlarmDescription || 'New alarm notification',
      CreatedTimestamp: alarmData.timestamp || alarmData.createdTimestamp || alarmData.CreatedTimestamp || new Date().toISOString(),
      DeviceId: alarmData.deviceId || alarmData.DeviceId || '',
      DeviceName: alarmData.deviceName || alarmData.DeviceName || 'Unknown Device',
      PlantName: alarmData.plantName || alarmData.PlantName || '',
      AlarmValue: alarmData.alarmValue || alarmData.AlarmValue || '',
      IsActive: true,
      IsRead: false
    };
    
    console.log('🔔 Processing individual alarm:', formattedAlarm);
    
    // Add to our alarms list (at the beginning to show most recent first)
    alarmsRef.current = [formattedAlarm, ...alarmsRef.current.slice(0, 4)];
    
    // Update state with the latest 5 alarms
    setRecentAlarms(alarmsRef.current);
    
    // Increment unread count
    setUnreadCount(prev => prev + 1);
    
    // Show browser notification if enabled
    if (showBrowserNotification) {
      try {
        // Check if browser notifications are supported and permission is granted
        if (window.Notification && Notification.permission === 'granted') {
          new Notification('Gas Monitor Alert', {
            body: `${formattedAlarm.AlarmCode}: ${formattedAlarm.AlarmDescription} (${formattedAlarm.DeviceName})`,
            icon: '/logo.png'
          });
        }
      } catch (err) {
        console.error('Error showing browser notification:', err);
      }
    }
  };
  
  // Initial load of alarms via API
  useEffect(() => {
    const fetchInitialAlarms = async () => {
      if (initialLoadDoneRef.current) return;
      
      try {
        setIsLoading(true);
        
        console.log('🔄 Initial loading of alarms via API');
        const response = await axios.get('http://localhost:5000/api/alarms');
        const alarms = response.data;
        
        // Calculate unread count
        const unreadAlarms = alarms.filter(alarm => !alarm.IsRead);
        setUnreadCount(unreadAlarms.length);
        
        // Store the recent alarms (up to 5)
        const recentOnes = alarms.slice(0, 5);
        
        // Format alarm data consistently for display
        const formattedAlarms = recentOnes.map(alarm => ({
          ...alarm,
          AlarmCode: alarm.AlarmCode || 'ALARM',
          AlarmDescription: alarm.AlarmDescription || 'Alarm notification',
          DeviceName: alarm.DeviceName || 'Unknown Device',
          PlantName: alarm.PlantName || '',
        }));
        
        alarmsRef.current = formattedAlarms;
        setRecentAlarms(formattedAlarms);
        setIsLoading(false);
        initialLoadDoneRef.current = true;
        
        console.log(`✅ Loaded ${alarms.length} alarms, ${unreadAlarms.length} unread`);
      } catch (error) {
        console.error('Error fetching initial alarms:', error);
        setError('Failed to load notifications. Please try again later.');
        setIsLoading(false);
      }
    };
    
    fetchInitialAlarms();
    
    // Request notification permission if not already granted
    if (window.Notification && Notification.permission !== 'granted' && Notification.permission !== 'denied') {
      Notification.requestPermission().then(permission => {
        setShowBrowserNotification(permission === 'granted');
      });
    } else {
      setShowBrowserNotification(Notification.permission === 'granted');
    }
  }, []);
  
  // Set up WebSocket listeners for real-time alarm updates
  useEffect(() => {
    console.log('📞 Setting up WebSocket listeners for individual alarms');
    
    // Register listeners for alarms from different channels
    socketService.onAlarm(processAlarm);
    socketService.onAlarmNotification(processAlarm);
    
    // Clean up listeners on unmount
    return () => {
      console.log('🚫 Removing WebSocket alarm listeners');
      socketService.removeListener('alarm', processAlarm);
      socketService.removeListener('alarm_notification', processAlarm);
    };
  }, []);
 
  return (
    <>
      <IconButton
        size="large"
        color="inherit"
        onClick={handleOpen}
        aria-controls="notification-menu"
        aria-haspopup="true"
        sx={{ 
          animation: unreadCount > 0 ? 'pulse 2s infinite' : 'none',
          '@keyframes pulse': {
            '0%': { boxShadow: '0 0 0 0 rgba(255, 0, 0, 0.2)' },
            '70%': { boxShadow: '0 0 0 10px rgba(255, 0, 0, 0)' },
            '100%': { boxShadow: '0 0 0 0 rgba(255, 0, 0, 0)' },
          }
        }}
      >
        <Badge badgeContent={unreadCount} color="error">
          <NotificationsIcon />
        </Badge>
      </IconButton>
      
      <Menu
        id="notification-menu"
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleClose}
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'right',
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'right',
        }}
        PaperProps={{
          style: {
            width: '350px',
            maxHeight: '400px',
          },
        }}
      >
        {/* Header */}
        <Box sx={{ p: 2, bgcolor: 'primary.main', color: 'white' }}>
          <Typography variant="subtitle1" fontWeight="bold">
            Notifications
          </Typography>
          <Typography variant="caption">
            {unreadCount > 0 ? `You have ${unreadCount} unread alert${unreadCount !== 1 ? 's' : ''}` : 'No new alerts'}
          </Typography>
        </Box>
        
        {/* Loading State - show a progress indicator but with latest alarms visible */}
        {isLoading && recentAlarms.length === 0 && (
          <Box sx={{ p: 3, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              Loading notifications...
            </Typography>
          </Box>
        )}
        
        {/* Error State */}
        {error && (
          <Box sx={{ p: 2 }}>
            <Alert severity="error" variant="outlined">
              {error}
            </Alert>
          </Box>
        )}
        
        {/* Notification List */}
        {!isLoading && !error && (
          <>
            {recentAlarms.length > 0 ? (
              <List sx={{ maxHeight: '250px', overflow: 'auto', padding: 0 }}>
                {recentAlarms.map((alarm) => (
                  <ListItem 
                    key={alarm._id || `alarm-${alarm.AlarmId}`}
                    divider
                    sx={{ 
                      padding: '12px 16px',
                      backgroundColor: alarm.IsRead ? 'inherit' : 'rgba(144, 202, 249, 0.1)',
                      '&:hover': { backgroundColor: 'rgba(0, 0, 0, 0.04)' }
                    }}
                  >
                    <Box sx={{ width: '100%' }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                        <Typography 
                          variant="subtitle2"
                          sx={{ fontWeight: alarm.IsRead ? 'normal' : 'bold', display: 'flex', alignItems: 'center' }}
                        >
                          <WarningIcon fontSize="small" sx={{ mr: 0.5, color: 'warning.main' }} />
                          {alarm.AlarmCode}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {formatTimestamp(alarm.CreatedTimestamp)}
                        </Typography>
                      </Box>
                      
                      <Typography variant="body2" sx={{ mb: 0.5 }}>
                        {alarm.AlarmDescription}
                      </Typography>
                      
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography variant="caption" color="text.secondary">
                          {alarm.DeviceName} ({alarm.PlantName})
                        </Typography>
                        
                        {!alarm.IsRead && (
                          <Button 
                            size="small" 
                            onClick={(e) => {
                              e.stopPropagation();
                              handleMarkAsRead(alarm._id);
                            }}
                            sx={{ textTransform: 'none', fontSize: '0.75rem', p: 0, minWidth: 'auto' }}
                          >
                            Mark as read
                          </Button>
                        )}
                      </Box>
                    </Box>
                  </ListItem>
                ))}
              </List>
            ) : (
              <Box sx={{ p: 3, textAlign: 'center' }}>
                <Typography variant="body2" color="text.secondary">
                  No notifications
                </Typography>
              </Box>
            )}
          </>
        )}
        
        {/* Footer */}
        <Divider />
        <Box sx={{ p: 1, display: 'flex', justifyContent: 'space-between' }}>
          <Button 
            onClick={handleMarkAllRead} 
            disabled={unreadCount === 0 || isLoading}
            size="small"
          >
            Mark all read
          </Button>
          <Button 
            onClick={handleViewAll} 
            color="primary"
            size="small"
          >
            View all alerts
          </Button>
        </Box>
      </Menu>
    </>
  );
};
 
export default AlarmNotification;
 