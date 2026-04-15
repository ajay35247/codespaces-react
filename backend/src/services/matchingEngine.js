import { matchingQueue, queueOptions } from '../queues/queueConfig.js';

export class MatchingEngine {
  static async scheduleLoadMatching(loadId) {
    await matchingQueue.add('match-load', { loadId }, {
      ...queueOptions,
      priority: 1,
      delay: 1000
    });
  }

  static async scheduleVehicleMatching(vehicleId) {
    await matchingQueue.add('match-vehicle', { vehicleId }, {
      ...queueOptions,
      priority: 2,
      delay: 500
    });
  }

  static async matchLoad(workflow) {
    const { loadId } = workflow.data;
    console.log('Matched engine processing load', loadId);
    // Real matching logic must be implemented here using actual DB models.
    // This placeholder ensures queue processing is available for scale.
    return { loadId, matched: true };
  }

  static async matchVehicle(workflow) {
    const { vehicleId } = workflow.data;
    console.log('Matched engine processing vehicle', vehicleId);
    return { vehicleId, matched: true };
  }
}
