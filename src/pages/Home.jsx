import ActivityPanels from '../components/ActivityPanels'
import { Card } from '../components/ui'

export default function Home() {
  // Fall back to the logo, then hide, if the banner image is missing.
  const onBannerError = (e) => {
    const img = e.currentTarget
    if (!img.dataset.fallback) {
      img.dataset.fallback = '1'
      img.src = `${import.meta.env.BASE_URL}logo.png`
      img.className = 'mx-auto my-6 h-20 w-auto'
    } else {
      img.style.display = 'none'
    }
  }

  return (
    <div>
      <Card className="mb-6 overflow-hidden p-0">
        <img
          src={`${import.meta.env.BASE_URL}banner.png`}
          alt="API — Assets, Properties & Investments"
          className="w-full"
          onError={onBannerError}
        />
      </Card>

      <h1 className="mb-5 text-2xl font-semibold">Dashboard</h1>
      <ActivityPanels />
    </div>
  )
}
