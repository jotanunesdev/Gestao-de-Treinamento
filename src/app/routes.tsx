import { lazy } from 'react'
import { Navigate, type RouteObject, useRoutes } from 'react-router-dom'

const LoginPage = lazy(() => import('../pages/login/LoginPage'))
const MainPage = lazy(() => import('../pages/main/MainPage'))

export const ROUTES = {
  login: '/login',
  main: '/home',
} as const

const publicRoutes: RouteObject[] = [
  {
    path: ROUTES.login,
    element: <LoginPage />,
  },
]

const appRoutes: RouteObject[] = [
  {
    path: ROUTES.main,
    element: <MainPage />,
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
