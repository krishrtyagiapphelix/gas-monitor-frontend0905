import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Chip,
  IconButton,
  Tooltip,
  CircularProgress,
  Alert,
  Button
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningIcon from '@mui/icons-material/Warning';
import InfoIcon from '@mui/icons-material/Info';
import { markAlarmAsRead } from '../../services/alarmService';
import socketService from '../../services/socketService';

const AlarmsTab = () => {
  // Use WebSocket-only approach for alarms
  const [alarms, setAlarms] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // UI state
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  
  // This ref will store all alarm data received via WebSocket
  const alarmsRef = useRef([]);
  
  // Handle new alarm data from WebSocket
  const handleNewAlarm = (alarmData) => {
    if (!alarmData) return;
    
    console.log('📢 Received new alarm via WebSocket:', alarmData);
    
    // Format alarm data consistently
    const formattedAlarm = {
      _id: alarmData.id || `alarm-${Date.now()}`,
      AlarmId: alarmData.id || alarmData.alarmId || '',
      AlarmCode: alarmData.alarmCode || '',
      AlarmDescription: alarmData.description || alarmData.alarmDescription || '',
      CreatedTimestamp: alarmData.timestamp || alarmData.createdTimestamp || new Date().toISOString(),
      DeviceId: alarmData.deviceId || '',
      DeviceName: alarmData.deviceName || '',
      PlantName: alarmData.plantName || '',
      IsActive: true,
      IsRead: false
    };
    
    // Update the alarms list with the new alarm at the top
    alarmsRef.current = [formattedAlarm, ...alarmsRef.current];
    setAlarms(alarmsRef.current);
  };
  
  // Connect to WebSocket for alarm updates
  useEffect(() => {
    // Set up WebSocket listeners for alarms
    socketService.onAlarm(handleNewAlarm);
    socketService.onAlarmNotification(handleNewAlarm);
    
    setIsLoading(false); // No loading state needed since we're using WebSockets only
    
    // Clean up on component unmount
    return () => {
      socketService.removeListener('alarm', handleNewAlarm);
      socketService.removeListener('alarm_notification', handleNewAlarm);
    };
  }, []);
 
  const handleChangePage = (event, newPage) => {
    setPage(newPage);
  };
 
  const handleChangeRowsPerPage = (event) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };
  
  const handleMarkAsRead = async (alarmId) => {
    try {
      // Try to mark the alarm as read (may not be needed in WebSocket-only implementation)
      await markAlarmAsRead(alarmId);
      
      // Update local state to mark the alarm as read
      setAlarms(prev => prev.map(alarm => 
        alarm._id === alarmId ? { ...alarm, IsRead: true } : alarm
      ));
      
    } catch (error) {
      console.error('Error marking alarm as read:', error);
    }
  };
  
  // Function to clear all alarms (for testing)
  const clearAlarms = () => {
    alarmsRef.current = [];
    setAlarms([]);
  };
 
  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ mt: 2 }}>
      {/* Status and Debug Info */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          Error: {error}
        </Alert>
      )}
      
      {alarms.length === 0 && !isLoading && (
        <Alert severity="info" sx={{ mb: 2 }} icon={<InfoIcon />}>
          No alarms received yet. WebSocket is listening for new alarms.
        </Alert>
      )}
      
      {/* WebSocket Status and Clear Button */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
        <Typography variant="body2" color="text.secondary">
          <span style={{ color: socketService.isConnected() ? 'green' : 'red' }}>
            ●
          </span> WebSocket {socketService.isConnected() ? 'Connected' : 'Disconnected'}
        </Typography>
        
        <Button
          onClick={clearAlarms}
          variant="outlined"
          size="small"
          color="warning"
        >
          Clear Alarms
        </Button>
      </Box>

      {/* Search Section */}
      <Paper elevation={2} sx={{ p: 2, mb: 2 }}>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', mb: 2 }}>
          <Typography>Search</Typography>
          <input
            type="text"
            placeholder="Search by Alarm Code or Description"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ padding: '8px', width: '300px' }}
          />
        </Box>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          <Typography>From Date</Typography>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            style={{ padding: '8px' }}
          />
          <Typography>To Date</Typography>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            style={{ padding: '8px' }}
          />
        </Box>
      </Paper>

      {/* Alarms Table */}
      <Paper elevation={2}>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Alarm Id</TableCell>
                <TableCell>Alarm Code</TableCell>
                <TableCell>Device Name</TableCell>
                <TableCell>Alarm Generated Time</TableCell>
                <TableCell>Alarm Description</TableCell>
                <TableCell>Alarm Status</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(alarms || [])
                .filter(alarm => {
                  // Apply search filter
                  const searchLower = searchQuery.toLowerCase();
                  const matchesSearch = searchQuery === '' ||
                    (alarm.AlarmCode && alarm.AlarmCode.toLowerCase().includes(searchLower)) ||
                    (alarm.AlarmDescription && alarm.AlarmDescription.toLowerCase().includes(searchLower));

                  // Apply date filters
                  const alarmDate = new Date(alarm.CreatedTimestamp);
                  const matchesFromDate = !fromDate || alarmDate >= new Date(fromDate);
                  const matchesToDate = !toDate || alarmDate <= new Date(toDate);

                  return matchesSearch && matchesFromDate && matchesToDate;
                })
                .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                .map((alarm) => (
                  <TableRow key={alarm._id} hover>
                    <TableCell>{alarm.AlarmId || '-'}</TableCell>
                    <TableCell>{alarm.AlarmCode || '-'}</TableCell>
                    <TableCell>{alarm.DeviceName || '-'}</TableCell>
                    <TableCell>
                      {alarm.CreatedTimestamp ? 
                        new Date(alarm.CreatedTimestamp).toLocaleString('en-US', {
                          year: 'numeric',
                          month: '2-digit',
                          day: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit'
                        }) : '-'}
                    </TableCell>
                    <TableCell>{alarm.AlarmDescription || '-'}</TableCell>
                    <TableCell>
                      <Chip 
                        icon={<WarningIcon />} 
                        label={alarm.AlarmCode && alarm.AlarmCode.includes('HIGH') ? "HIGH" : "LOW"} 
                        color={alarm.AlarmCode && alarm.AlarmCode.includes('HIGH') ? "error" : "warning"} 
                        size="small" 
                        sx={{ minWidth: '90px' }}
                      />
                    </TableCell>
                    <TableCell>
                      {!alarm.IsRead && (
                        <Tooltip title="Mark as read">
                          <IconButton size="small" onClick={() => handleMarkAsRead(alarm._id)}>
                            <CheckCircleIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          rowsPerPageOptions={[5, 10, 25]}
          component="div"
          count={(alarms || []).length}
          rowsPerPage={rowsPerPage}
          page={page}
          onPageChange={handleChangePage}
          onRowsPerPageChange={handleChangeRowsPerPage}
        />
      </Paper>
    </Box>
  );
};

export default AlarmsTab;
 