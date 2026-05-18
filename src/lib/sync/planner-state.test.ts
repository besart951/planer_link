import { describe, expect, it } from 'vitest';
import { applySyncRecordsToStoredPlanner } from './planner-state';
import type { SyncRecordData } from './types';

const nowIso = '2026-05-17T10:00:00.000Z';

describe('applySyncRecordsToStoredPlanner', () => {
  it('restores client and appointment records into the planner state', () => {
    const result = applySyncRecordsToStoredPlanner(
      [
        record({
          entity: 'client',
          id: 'client-1',
          data: {
            name: 'Maria Huber',
            address: 'Bahnhofstrasse 12',
            defaultStart: '08:00',
            defaultEnd: '08:30'
          }
        }),
        record({
          entity: 'employee',
          id: 'emp-1',
          data: {
            name: 'Anna Keller',
            role: 'Pflege',
            phone: ''
          }
        }),
        record({
          entity: 'appointment',
          id: 'apt-1',
          data: {
            employeeId: 'emp-1',
            day: 'mo',
            date: '2026-05-11',
            clientName: 'Maria Huber',
            clientAddress: 'Bahnhofstrasse 12',
            start: '08:00',
            end: '08:30'
          }
        })
      ],
      {
        clients: [],
        employees: [],
        weekStart: '2026-05-11'
      }
    );

    expect(result.clients?.[0]).toMatchObject({
      name: 'Maria Huber',
      address: 'Bahnhofstrasse 12'
    });
    expect(result.employees?.[0].appointments[0]).toMatchObject({
      id: 'apt-1',
      clientName: 'Maria Huber',
      clientAddress: 'Bahnhofstrasse 12',
      date: '2026-05-11'
    });
  });

  it('migrates legacy appointment records with resolvable clientId', () => {
    const result = applySyncRecordsToStoredPlanner(
      [
        record({
          entity: 'client',
          id: 'client-1',
          data: {
            name: 'Maria Huber',
            address: 'Bahnhofstrasse 12',
            defaultStart: '08:00',
            defaultEnd: '08:30'
          }
        }),
        record({
          entity: 'employee',
          id: 'emp-1',
          data: {
            name: 'Anna Keller',
            role: '',
            phone: ''
          }
        }),
        record({
          entity: 'appointment',
          id: 'legacy-apt',
          data: {
            employeeId: 'emp-1',
            day: 'mo',
            date: '2026-05-11',
            clientId: 'client-1',
            start: '08:00',
            end: '08:30'
          }
        })
      ],
      {
        clients: [],
        employees: [],
        weekStart: '2026-05-11'
      }
    );

    expect(result.employees?.[0].appointments[0]).toMatchObject({
      clientName: 'Maria Huber',
      clientAddress: 'Bahnhofstrasse 12'
    });
  });

  it('keeps existing appointments when a client record is deleted', () => {
    const result = applySyncRecordsToStoredPlanner(
      [
        record({
          entity: 'client',
          id: 'client-1',
          deleted_at: '2026-05-17T10:05:00.000Z'
        })
      ],
      {
        clients: [
          {
            id: 'client-1',
            name: 'Maria Huber',
            address: 'Bahnhofstrasse 12',
            defaultStart: '08:00',
            defaultEnd: '08:30'
          }
        ],
        employees: [
          {
            id: 'emp-1',
            name: 'Anna Keller',
            role: '',
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
        ],
        weekStart: '2026-05-11'
      }
    );

    expect(result.clients).toEqual([]);
    expect(result.employees?.[0].appointments[0]).toMatchObject({
      clientName: 'Maria Huber',
      clientAddress: 'Bahnhofstrasse 12'
    });
  });
});

function record(overrides: Partial<SyncRecordData>): SyncRecordData {
  return {
    entity: 'employee',
    id: 'record-1',
    data: {},
    created_at: nowIso,
    updated_at: nowIso,
    deleted_at: null,
    version_hlc: '1000-0-device-a',
    device_id: 'device-a',
    user_id: null,
    field_versions_json: {},
    ...overrides
  };
}
