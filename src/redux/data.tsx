// src/redux/dataSlice.js
import { createSlice, PayloadAction } from "@reduxjs/toolkit";
export interface DataState {
  value: Record<string, any>;
}

const initialState: DataState = {
  value: {},
};

export const dataSlice = createSlice({
  name: "data",
  initialState,
  reducers: {
    setData: (state, action: PayloadAction<Record<string, any>>) => {
      state.value = action.payload;
    },
    unsetData: (state) => {
      state.value = {};
    },
  },
});

export const { setData, unsetData } = dataSlice.actions;

export default dataSlice.reducer;
