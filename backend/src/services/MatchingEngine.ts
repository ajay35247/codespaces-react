import { Vehicle } from '../models/Vehicle';
import { Load } from '../models/Load';
import { NotificationService } from './NotificationService';

export class MatchingEngine {
  private notificationService: NotificationService;

  constructor(notificationService: NotificationService) {
    this.notificationService = notificationService;
  }

  async matchLoadToVehicles(loadId: string): Promise<void> {
    const load = await Load.findById(loadId).populate('shipperId');
    if (!load) return;

    const matchingVehicles = await this.findMatchingVehicles(load);

    if (matchingVehicles.length > 0) {
      load.matchedVehicles = matchingVehicles.map(v => v._id);
      await load.save();

      // Notify shipper about available vehicles
      await this.notificationService.notifyShipperOfAvailableVehicles(load.shipperId._id.toString(), matchingVehicles.length, load);

      // Notify vehicle owners/drivers/brokers
      for (const vehicle of matchingVehicles) {
        const userId = vehicle.brokerId ? vehicle.brokerId.toString() : vehicle.ownerId.toString();
        await this.notificationService.notifyVehicleOwnerOfLoadMatch(userId, load);
      }
    }
  }

  async matchVehicleToLoads(vehicleId: string): Promise<void> {
    const vehicle = await Vehicle.findById(vehicleId).populate('ownerId');
    if (!vehicle || vehicle.availabilityStatus !== 'available' || vehicle.emptyTruckStatus !== 'empty') return;

    const matchingLoads = await this.findMatchingLoads(vehicle);

    for (const load of matchingLoads) {
      await this.notificationService.notifyVehicleOwnerOfLoadMatch(vehicle.ownerId._id.toString(), load);
    }
  }

  private async findMatchingVehicles(load: any): Promise<any[]> {
    const query: any = {
      availabilityStatus: 'available',
      emptyTruckStatus: 'empty',
      vehicleCategory: this.getCompatibleVehicleCategories(load.vehicleRequired),
    };

    // Geo query for pickup location within 50km
    query['currentLocation'] = {
      $near: {
        $geometry: {
          type: 'Point',
          coordinates: [load.pickupLocation.lng, load.pickupLocation.lat]
        },
        $maxDistance: 50000 // 50km
      }
    };

    // Route similarity check
    if (load.dropLocation) {
      query.$or = [
        { 'currentRoute.to': { $regex: load.dropLocation.city, $options: 'i' } },
        { 'currentRoute.from': { $regex: load.pickupLocation.city, $options: 'i' } }
      ];
    }

    const vehicles = await Vehicle.find(query).limit(20);
    return vehicles.filter(vehicle => this.isCapacityCompatible(vehicle, load));
  }

  private async findMatchingLoads(vehicle: any): Promise<any[]> {
    const query: any = {
      status: 'posted',
      vehicleRequired: { $in: this.getCompatibleVehicleCategories(vehicle.vehicleCategory) }
    };

    // Geo query
    query['pickupLocation'] = {
      $near: {
        $geometry: {
          type: 'Point',
          coordinates: [vehicle.currentLocation.lng, vehicle.currentLocation.lat]
        },
        $maxDistance: 50000
      }
    };

    const loads = await Load.find(query).limit(10);
    return loads.filter(load => this.isCapacityCompatible(vehicle, load));
  }

  private getCompatibleVehicleCategories(required: string): string[] {
    const categories = {
      'bike': ['bike'],
      'mini_truck': ['mini_truck', 'pickup', 'lcv'],
      'lcv': ['lcv', 'mcv'],
      'mcv': ['mcv', 'hcv'],
      'hcv': ['hcv', '20_tyre', '50_ton'],
      '20_tyre': ['20_tyre', '50_ton'],
      '50_ton': ['50_ton']
    };
    return categories[required] || [required];
  }

  private isCapacityCompatible(vehicle: any, load: any): boolean {
    return vehicle.capacityTon >= load.loadWeight / 1000;
  }
}