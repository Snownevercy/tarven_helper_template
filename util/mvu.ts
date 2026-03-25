<<<<<<< HEAD
=======
import { StoreDefinition } from 'pinia';

>>>>>>> b80a86e4d72312ede7f291df2c1c65bd1f7e93eb
export function defineMvuDataStore<T extends z.ZodObject>(
  schema: T,
  variable_option: VariableOption,
  additional_setup?: (data: Ref<z.infer<T>>) => void,
<<<<<<< HEAD
): ReturnType<typeof defineStore> {
=======
): StoreDefinition<`mvu_data.${string}`, { data: Ref<z.infer<T>> }> {
>>>>>>> b80a86e4d72312ede7f291df2c1c65bd1f7e93eb
  if (
    variable_option.type === 'message' &&
    (variable_option.message_id === undefined || variable_option.message_id === 'latest')
  ) {
    variable_option.message_id = -1;
  }

  return defineStore(
    `mvu_data.${_(variable_option)
      .entries()
      .sortBy(entry => entry[0])
      .map(entry => entry[1])
      .join('.')}`,
    errorCatched(() => {
<<<<<<< HEAD
      const data = ref(schema.parse(_.get(getVariables(variable_option), 'stat_data', {}))) as Ref<z.infer<T>>;
=======
      const data = ref(
        schema.parse(_.get(getVariables(variable_option), 'stat_data', {}), { reportInput: true }),
      ) as Ref<z.infer<T>>;
>>>>>>> b80a86e4d72312ede7f291df2c1c65bd1f7e93eb
      if (additional_setup) {
        additional_setup(data);
      }

      useIntervalFn(() => {
        const stat_data = _.get(getVariables(variable_option), 'stat_data', {});
        const result = schema.safeParse(stat_data);
        if (result.error) {
          return;
        }
        if (!_.isEqual(data.value, result.data)) {
          ignoreUpdates(() => {
            data.value = result.data;
          });
<<<<<<< HEAD
        }
        if (!_.isEqual(stat_data, result.data)) {
          updateVariablesWith(variables => _.set(variables, 'stat_data', result.data), variable_option);
        }
=======
          if (!_.isEqual(stat_data, result.data)) {
            updateVariablesWith(variables => _.set(variables, 'stat_data', result.data), variable_option);
          }
        }
>>>>>>> b80a86e4d72312ede7f291df2c1c65bd1f7e93eb
      }, 2000);

      const { ignoreUpdates } = watchIgnorable(
        data,
        new_data => {
          const result = schema.safeParse(new_data);
          if (result.error) {
            return;
          }
          if (!_.isEqual(new_data, result.data)) {
            ignoreUpdates(() => {
              data.value = result.data;
            });
          }
          updateVariablesWith(variables => _.set(variables, 'stat_data', result.data), variable_option);
        },
        { deep: true },
      );

      return { data };
    }),
  );
}
