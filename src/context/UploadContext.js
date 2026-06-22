import React, { createContext, useContext, useState } from 'react';

const UploadContext = createContext(null);

export function UploadProvider({ children }) {
  const [visible, setVisible] = useState(false);
  const [initialData, setInitialData] = useState(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const openUploader = (data = null) => {
    setInitialData(data);
    setVisible(true);
  };

  const closeUploader = () => {
    setVisible(false);
    setInitialData(null);
  };

  const notifyUploadComplete = () => {
    setRefreshTrigger(prev => prev + 1);
    closeUploader();
  };

  return (
    <UploadContext.Provider value={{
      visible,
      initialData,
      refreshTrigger,
      openUploader,
      closeUploader,
      notifyUploadComplete,
    }}>
      {children}
    </UploadContext.Provider>
  );
}

export const useUpload = () => useContext(UploadContext);
