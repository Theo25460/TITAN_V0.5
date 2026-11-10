import { JourneyCard } from "../../components/JourneyCard";
import { Screen } from "../../components/Screen";
import { useOwner } from "../../data/auth";

export function SentiersScreen() {
  const owner = useOwner();
  return <Screen><JourneyCard owner={owner} /></Screen>;
}
