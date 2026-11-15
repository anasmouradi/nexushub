import 'dotenv/config';
import { hash } from 'bcryptjs';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  Priority,
  ProjectStatus,
  PrismaClient,
  TaskStatus,
  UserRole,
} from '../generated/prisma/client';

if (process.env.NODE_ENV === 'production') {
  throw new Error('Refusing to run the demo seed in production');
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is not configured');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

const COMPANY_ID = '00000000-0000-4000-8000-000000000001';
const id = (value: number) =>
  `00000000-0000-4000-8000-${value.toString().padStart(12, '0')}`;
const demoPassword = 'NexusHub-Demo-2026!';

const users = [
  {
    id: id(1),
    email: 'admin@demo.nexushub.local',
    role: UserRole.COMPANY_ADMIN,
    firstName: 'Alex',
    lastName: 'Admin',
  },
  {
    id: id(2),
    email: 'manager.dev@demo.nexushub.local',
    role: UserRole.MANAGER,
    firstName: 'Morgan',
    lastName: 'Dev',
  },
  {
    id: id(3),
    email: 'manager.design@demo.nexushub.local',
    role: UserRole.MANAGER,
    firstName: 'Casey',
    lastName: 'Design',
  },
  ...Array.from({ length: 5 }, (_, index) => ({
    id: id(index + 4),
    email: `employee${index + 1}@demo.nexushub.local`,
    role: UserRole.EMPLOYEE,
    firstName: ['Jamie', 'Riley', 'Taylor', 'Jordan', 'Avery'][index],
    lastName: 'Demo',
  })),
];

const teamDefinitions = [
  {
    id: id(20),
    name: 'Development',
    managerId: id(2),
    memberIds: [id(4), id(5)],
  },
  { id: id(21), name: 'Design', managerId: id(3), memberIds: [id(6), id(7)] },
  { id: id(22), name: 'Marketing', managerId: id(2), memberIds: [id(8)] },
];

const projectStatuses = [
  ProjectStatus.PLANNING,
  ProjectStatus.IN_PROGRESS,
  ProjectStatus.IN_PROGRESS,
  ProjectStatus.ON_HOLD,
  ProjectStatus.COMPLETED,
  ProjectStatus.COMPLETED,
  ProjectStatus.CANCELLED,
  ProjectStatus.PLANNING,
];
const priorities = [
  Priority.LOW,
  Priority.MEDIUM,
  Priority.HIGH,
  Priority.URGENT,
];
const projectNames = [
  'Portail client',
  'Refonte de la plateforme',
  'Application mobile',
  'Campagne de lancement',
  'Design system',
  'Automatisation CRM',
  'Migration des données',
  'Optimisation SEO',
];

function monthsAgo(months: number, day = 15) {
  const date = new Date();
  const targetDay = months === 0 ? Math.min(day, date.getUTCDate()) : day;
  date.setUTCMonth(date.getUTCMonth() - months, targetDay);
  date.setUTCHours(12, 0, 0, 0);
  return date;
}

async function seed() {
  const passwordHash = await hash(demoPassword, 10);
  await prisma.company.upsert({
    where: { id: COMPANY_ID },
    create: { id: COMPANY_ID, name: 'NexusHub Demo' },
    update: { name: 'NexusHub Demo' },
  });

  for (const user of users) {
    await prisma.user.upsert({
      where: { id: user.id },
      create: {
        ...user,
        companyId: COMPANY_ID,
        passwordHash,
        isActive: true,
      },
      update: {
        ...user,
        companyId: COMPANY_ID,
        passwordHash,
        isActive: true,
      },
    });
  }

  for (const team of teamDefinitions) {
    await prisma.team.upsert({
      where: { id: team.id },
      create: {
        id: team.id,
        companyId: COMPANY_ID,
        name: team.name,
        managerId: team.managerId,
        description: `${team.name} demo team`,
      },
      update: {
        companyId: COMPANY_ID,
        name: team.name,
        managerId: team.managerId,
        description: `${team.name} demo team`,
      },
    });
    await prisma.teamMember.createMany({
      data: [team.managerId, ...team.memberIds].map((userId) => ({
        teamId: team.id,
        userId,
      })),
      skipDuplicates: true,
    });
  }

  const projectTeams = projectNames.map(
    (_, index) => teamDefinitions[index % teamDefinitions.length],
  );
  for (let index = 0; index < projectNames.length; index += 1) {
    const team = projectTeams[index];
    const createdAt = monthsAgo(7 - (index % 6), 8 + (index % 15));
    const projectId = id(30 + index);
    await prisma.project.upsert({
      where: { id: projectId },
      create: {
        id: projectId,
        companyId: COMPANY_ID,
        name: projectNames[index],
        description: `Projet de démonstration ${projectNames[index]}.`,
        status: projectStatuses[index],
        priority: priorities[index % priorities.length],
        managerId: team.managerId,
        teamId: team.id,
        createdById: id(1),
        createdAt,
        updatedAt: createdAt,
      },
      update: {
        name: projectNames[index],
        description: `Projet de démonstration ${projectNames[index]}.`,
        status: projectStatuses[index],
        priority: priorities[index % priorities.length],
        managerId: team.managerId,
        teamId: team.id,
        updatedAt: createdAt,
      },
    });
    await prisma.projectMember.createMany({
      data: [team.managerId, ...team.memberIds, id(1)].map((userId) => ({
        projectId,
        userId,
      })),
      skipDuplicates: true,
    });
  }

  const taskStatuses = [
    TaskStatus.TODO,
    TaskStatus.IN_PROGRESS,
    TaskStatus.REVIEW,
    TaskStatus.DONE,
    TaskStatus.DONE,
  ];
  for (let index = 0; index < 48; index += 1) {
    const projectIndex = index % projectNames.length;
    const team = projectTeams[projectIndex];
    const taskStatus = taskStatuses[index % taskStatuses.length];
    const createdAt = monthsAgo(5 - Math.floor(index / 8), 3 + (index % 24));
    const dueDate = new Date(createdAt);
    dueDate.setUTCDate(dueDate.getUTCDate() + (index % 4 === 0 ? 2 : 18));
    if (index % 9 === 0) dueDate.setUTCDate(dueDate.getUTCDate() - 45);
    const completedAt =
      taskStatus === TaskStatus.DONE
        ? new Date(
            Math.min(
              Date.now(),
              createdAt.getTime() + (2 + (index % 20)) * 24 * 60 * 60 * 1000,
            ),
          )
        : null;
    const assigneeId = team.memberIds[index % team.memberIds.length];
    const taskId = id(100 + index);
    const taskData = {
      companyId: COMPANY_ID,
      projectId: id(30 + projectIndex),
      title: `Tâche ${String(index + 1).padStart(2, '0')} — ${projectNames[projectIndex]}`,
      description: `Élément de démonstration ${index + 1}.`,
      status: taskStatus,
      priority: priorities[index % priorities.length],
      position: index * 100,
      assigneeId,
      creatorId: team.managerId,
      dueDate,
      estimatedHours: 2 + (index % 8),
      actualHours: taskStatus === TaskStatus.DONE ? 2 + (index % 6) : null,
      completedAt,
      createdAt,
      updatedAt: completedAt ?? createdAt,
    };
    await prisma.task.upsert({
      where: { id: taskId },
      create: { id: taskId, ...taskData },
      update: taskData,
    });
  }

  console.log(
    `Seeded NexusHub Demo with ${users.length} users, ${teamDefinitions.length} teams, 8 projects, and 48 tasks.`,
  );
  console.log(`Demo login: ${users[0].email} / ${demoPassword}`);
}

seed()
  .catch((error: unknown) => {
    console.error('Demo seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
