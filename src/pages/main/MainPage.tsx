import { useReadViewContext } from '../../app/readViewContext'

function MainPage() {
  const { data } = useReadViewContext()

  return (
    <section>
      <pre>{data ? JSON.stringify(data, null, 2) : 'Sem dados'}</pre>
    </section>
  )
}

export default MainPage
