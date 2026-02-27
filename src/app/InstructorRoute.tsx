import type { ReactNode } from "react"
import { Navigate, useLocation } from "react-router-dom"
import { ROUTES } from "./paths"
import { useReadViewContext } from "./readViewContext"

type InstructorRouteProps = {
  children: ReactNode
}

const InstructorRoute = ({ children }: InstructorRouteProps) => {
  const { data } = useReadViewContext<{ User?: { INSTRUTOR?: boolean } }>()
  const location = useLocation()

  if (!data) {
    return (
      <Navigate
        to={{
          pathname: ROUTES.login,
          search: location.search,
          hash: location.hash,
        }}
        replace
        state={{ from: location }}
      />
    )
  }

  if (!data.User?.INSTRUTOR) {
    return <Navigate to={ROUTES.mainDashboard} replace />
  }

  return <>{children}</>
}

export default InstructorRoute
