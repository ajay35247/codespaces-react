import React from 'react';
import { motion } from 'framer-motion';
import { Vehicle } from '../../../shared/types';

interface VehicleCardProps {
  vehicle: Vehicle;
  onSelect?: (vehicle: Vehicle) => void;
}

const getVehicleIcon = (category: Vehicle['vehicleCategory']) => {
  const icons = {
    bike: '🏍️',
    '3_wheeler': '🛺',
    mini_truck: '🚐',
    pickup: '🚙',
    lcv: '🚛',
    mcv: '🚚',
    hcv: '🚛',
    trailer: '🚚',
    container: '🚛',
    '20_tyre': '🚛',
    '50_ton': '🚛'
  };
  return icons[category] || '🚛';
};

const VehicleCard: React.FC<VehicleCardProps> = ({ vehicle, onSelect }) => {
  const isAvailable = vehicle.availabilityStatus === 'available' && vehicle.emptyTruckStatus === 'empty';

  return (
    <motion.div
      className={`p-4 border rounded-lg shadow-md cursor-pointer transition-all ${
        isAvailable ? 'border-green-500 bg-green-50' : 'border-gray-300 bg-white'
      }`}
      whileHover={{ scale: 1.05, y: -5 }}
      whileTap={{ scale: 0.95 }}
      onClick={() => onSelect?.(vehicle)}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="flex items-center space-x-4">
        <motion.div
          className="text-4xl"
          animate={isAvailable ? { rotate: [0, 10, -10, 0] } : {}}
          transition={{ duration: 2, repeat: Infinity }}
        >
          {getVehicleIcon(vehicle.vehicleCategory)}
        </motion.div>
        <div className="flex-1">
          <h3 className="font-bold text-lg">{vehicle.vehicleNumber}</h3>
          <p className="text-sm text-gray-600">{vehicle.vehicleCategory.toUpperCase()} - {vehicle.bodyType}</p>
          <p className="text-sm">Capacity: {vehicle.capacityTon} tons</p>
          <div className="flex items-center space-x-2 mt-2">
            <span className={`px-2 py-1 rounded text-xs ${
              isAvailable ? 'bg-green-200 text-green-800' : 'bg-gray-200 text-gray-800'
            }`}>
              {vehicle.availabilityStatus}
            </span>
            <span className={`px-2 py-1 rounded text-xs ${
              vehicle.emptyTruckStatus === 'empty' ? 'bg-blue-200 text-blue-800' : 'bg-yellow-200 text-yellow-800'
            }`}>
              {vehicle.emptyTruckStatus}
            </span>
          </div>
        </div>
      </div>
      {vehicle.currentRoute && (
        <motion.div
          className="mt-4 p-2 bg-blue-50 rounded"
          initial={{ width: 0 }}
          animate={{ width: '100%' }}
          transition={{ duration: 1 }}
        >
          <p className="text-sm">Route: {vehicle.currentRoute.from} → {vehicle.currentRoute.to}</p>
        </motion.div>
      )}
    </motion.div>
  );
};

export default VehicleCard;