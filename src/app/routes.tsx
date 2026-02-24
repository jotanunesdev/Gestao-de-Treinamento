import { lazy } from 'react'
import { Navigate, type RouteObject, useRoutes } from 'react-router-dom'
import { MAIN_ROUTE_SEGMENTS, ROUTES } from './paths'
import ProtectedRoute from './ProtectedRoute'
import InstructorRoute from './InstructorRoute'

const LoginPage = lazy(() => import('../pages/login/LoginPage'))
const MainPage = lazy(() => import('../pages/main/MainPage'))
const DashboardPage = lazy(() => import('../pages/main/DashboardPage'))
const TrainingsPage = lazy(() => import('../pages/main/TrainingsPage'))
const CompletedCoursesPage = lazy(() => import('../pages/main/CompletedCoursesPage'))
const Instructor = lazy(() => import('../pages/main/Instructor'))
const SystemSettingsPage = lazy(() => import('../pages/main/SystemSettingsPage'))

const publicRoutes: RouteObject[] = [
  {
    path: ROUTES.login,
    element: <LoginPage />,
  },
]

const appRoutes: RouteObject[] = [
  {
    path: ROUTES.main,
    element: (
      <ProtectedRoute>
        <MainPage />
      </ProtectedRoute>
    ),
    children: [
      {
        index: true,
        element: <Navigate to={ROUTES.mainDashboard} replace />,
      },
      {
        path: MAIN_ROUTE_SEGMENTS.dashboard,
        element: <DashboardPage />,
      },
      {
        path: MAIN_ROUTE_SEGMENTS.trainings,
        element: <TrainingsPage />,
      },
      {
        path: MAIN_ROUTE_SEGMENTS.completed,
        element: <CompletedCoursesPage />,
      },
      {
        path: MAIN_ROUTE_SEGMENTS.instructor,
        element: (
          <InstructorRoute>
            <Instructor />
          </InstructorRoute>
        ),
      },
      {
        path: MAIN_ROUTE_SEGMENTS.settings,
        element: <SystemSettingsPage />,
      },
    ],
  },
]

const routes: RouteObject[] = [
  ...publicRoutes,
  ...appRoutes,
  {
    path: '*',
    element: <Navigate to={ROUTES.login} replace />,
  },
]

export function AppRoutes() {
  return useRoutes(routes)
}
