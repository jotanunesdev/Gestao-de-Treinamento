import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { ROUTES } from './paths'
import { useReadViewContext } from './readViewContext'

type ProtectedRouteProps = {
  children: ReactNode
}

const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
  const { data } = useReadViewContext()
  const location = useLocation()

  if (!data) {
    return <Navigate to={ROUTES.login} replace state={{ from: location }} />
  }

  return <>{children}</>
}

export default ProtectedRoute
