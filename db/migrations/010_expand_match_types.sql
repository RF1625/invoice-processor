DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'match_type'
      AND e.enumlabel = 'amount_lt'
  ) THEN
    ALTER TYPE match_type ADD VALUE 'amount_lt';
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'match_type'
      AND e.enumlabel = 'amount_lte'
  ) THEN
    ALTER TYPE match_type ADD VALUE 'amount_lte';
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'match_type'
      AND e.enumlabel = 'amount_gt'
  ) THEN
    ALTER TYPE match_type ADD VALUE 'amount_gt';
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'match_type'
      AND e.enumlabel = 'amount_gte'
  ) THEN
    ALTER TYPE match_type ADD VALUE 'amount_gte';
  END IF;
END
$$;

