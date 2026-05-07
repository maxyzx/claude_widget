import React from 'react'
import { UsageWidget } from './components/UsageWidget'
import { useUsageData } from './hooks/use-usage-data'

export default function App(): React.JSX.Element {
  const data = useUsageData()
  return <UsageWidget data={data} />
}
