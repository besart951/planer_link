import { describe, expect, it } from 'vitest';
import { storedPlannerToSyncChanges } from './planner-changes';

describe('storedPlannerToSyncChanges', () => {
  it('normalizes localStorage planner data into client, employee, appointment and settings changes', () => {
    const changes = storedPlannerToSyncChanges({
      deviceId: 'device-a',
      now: new Date('2026-05-17T10:00:00.000Z'),
      storedPlanner: {
        clients: [
          {
            id: 'client-1',
            name: 'Maria Huber',
            address: 'Bahnhofstrasse 12',
            defaultStart: '08:00',
            defaultEnd: '08:30'
          }
        ],
        selectedEmployeeId: 'emp-1',
        weekStart: '2026-05-11',
        employees: [
          {
            id: 'emp-1',
            name: 'Anna Keller',
            role: 'Pflege',
            phone: '',
            appointments: [
              {
                id: 'apt-1',
                day: 'mo',
                date: '2026-05-11',
                clientName: 'Maria Huber',
                clientAddress: 'Bahnhofstrasse 12',
                start: '08:00',
                end: '08:30'
              }
            ]
          }
        ]
      }
    });

    expect(changes.map((change) => change.entity)).toEqual([
      'client',
      'employee',
      'appointment',
      'planner_settings'
    ]);
    expect(changes[0].fields.name).toBe('Maria Huber');
    expect(changes[0].fields.address).toBe('Bahnhofstrasse 12');
    expect(changes[2].fields.employeeId).toBe('emp-1');
    expect(changes[2].fields.clientName).toBe('Maria Huber');
    expect(changes[2].fields.clientAddress).toBe('Bahnhofstrasse 12');
    expect(changes[2].fields.clientId).toBeUndefined();
    expect(changes[3].id).toBe('planner-settings');
  });

  it('emits stable delete changes for locally deleted planner records', () => {
    const changes = storedPlannerToSyncChanges({
      deviceId: 'device-a',
      now: new Date('2026-05-17T10:00:00.000Z'),
      storedPlanner: {
        clients: [],
        employees: [],
        deletedRecords: [
          {
            entity: 'client',
            id: 'client-1',
            deletedAt: '2026-05-17T09:30:00.000Z'
          }
        ],
        weekStart: '2026-05-11'
      }
    });

    expect(changes[0]).toMatchObject({
      op_id: 'localstorage:delete:client:client-1:2026-05-17T09:30:00.000Z',
      entity: 'client',
      id: 'client-1',
      operation: 'delete',
      deleted_at: '2026-05-17T09:30:00.000Z'
    });
  });
});
