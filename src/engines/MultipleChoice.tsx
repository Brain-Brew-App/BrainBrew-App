import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { OptionButton } from '../components/OptionButton';
import { spacing } from '../theme/theme';
import type { ChoiceOption } from '../types/puzzle';

interface MultipleChoiceProps {
  options: ChoiceOption[];
  correctOptionId: string;
  revealed: boolean;
  onSelect: (optionId: string) => void;
  /** Rendered above the options — the sequence, the premises, etc. */
  stimulus?: ReactNode;
  /** The category accent, used for the selected-row border. */
  accent?: string;
}

/** The shared body of Pattern, Logic and Language Logic. */
export function MultipleChoice({
  options,
  correctOptionId,
  revealed,
  onSelect,
  stimulus,
  accent,
}: MultipleChoiceProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const handlePress = (optionId: string) => {
    if (revealed) return;
    setSelectedId(optionId);
    onSelect(optionId);
  };

  return (
    <View style={styles.container}>
      {stimulus}
      <View style={styles.options}>
        {options.map((option) => (
          <OptionButton
            key={option.id}
            label={option.label}
            onPress={() => handlePress(option.id)}
            revealed={revealed}
            isCorrect={option.id === correctOptionId}
            isSelected={option.id === selectedId}
            accent={accent}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.xl },
  options: { gap: spacing.sm },
});
