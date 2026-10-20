import { chromaticButton } from '@reactdrops/catalog-data/catalog';
import ChromaticMaterialPage from './chromatic-material-page';

export function chromaticButtonMeta() {
  return [
    { title: 'Chromatic Button — ReactDrops' },
    { name: 'description', content: chromaticButton.description },
  ];
}
export default function ChromaticButtonPage() {
  return <ChromaticMaterialPage kind="button" />;
}
