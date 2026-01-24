export const MAIN_ROUTE_SEGMENTS = {
  dashboard: 'dashboard',
  trainings: 'treinamentos',
  completed: 'cursos-finalizados',
  instructor: 'instrutor'
} as const

export const ROUTES = {
  login: '/login',
  main: '/home',
  mainDashboard: `/home/${MAIN_ROUTE_SEGMENTS.dashboard}`,
  mainTrainings: `/home/${MAIN_ROUTE_SEGMENTS.trainings}`,
  mainCompleted: `/home/${MAIN_ROUTE_SEGMENTS.completed}`,
  instructor: `/home/${MAIN_ROUTE_SEGMENTS.instructor}`,
} as const
