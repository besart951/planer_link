import { describe, expect, it } from 'vitest';
import {
  employeeAppointmentCount,
  normaliseClients,
  normaliseEmployees
} from './planner';

describe('planner normalization', () => {
  it('keeps empty v2 collections empty', () => {
    expect(normaliseClients([])).toEqual([]);
    expect(normaliseEmployees([], '2026-05-11')).toEqual([]);
  });

  it('migrates linked client appointments into standalone appointment text', () => {
    const employees = normaliseEmployees(
      [
        {
          id: 'emp-1',
          name: 'Anna Keller',
          role: '',
          phone: '',
          appointments: [
            {
              id: 'legacy-apt',
              day: 'mo',
              date: '2026-05-11',
              repeat: 'weekly',
              client: 'Maria Huber',
              start: '08:00',
              end: '08:30'
            },
            {
              id: 'apt-1',
              day: 'di',
              date: '2026-05-12',
              clientId: 'client-1',
              start: '09:00',
              end: '09:30'
            }
          ]
        }
      ],
      '2026-05-11',
      [
        {
          id: 'client-1',
          name: 'Peter Meier',
          address: 'Bahnhofstrasse 12',
          defaultStart: '09:00',
          defaultEnd: '09:30'
        }
      ]
    );

    expect(employees[0].appointments).toHaveLength(1);
    expect(employees[0].appointments[0]).toMatchObject({
      id: 'apt-1',
      clientName: 'Peter Meier',
      clientAddress: 'Bahnhofstrasse 12'
    });
  });
});

describe('employeeAppointmentCount', () => {
  it('counts concrete dated appointments within the requested range only', () => {
    const [employee] = normaliseEmployees(
      [
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
              clientAddress: '',
              start: '08:00',
              end: '08:30'
            },
            {
              id: 'apt-2',
              day: 'mo',
              date: '2026-05-18',
              clientName: 'Maria Huber',
              clientAddress: '',
              start: '08:00',
              end: '08:30'
            }
          ]
        }
      ],
      '2026-05-11'
    );

    expect(employeeAppointmentCount(employee, '2026-05-11', '2026-05-17')).toBe(1);
  });
});
